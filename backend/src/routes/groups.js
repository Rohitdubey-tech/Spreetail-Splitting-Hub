import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { calculateNetBalances, getDirectDebts, getSimplifiedDebts } from '../utils/balances.js';

const router = Router();
const prisma = new PrismaClient();

// Get all groups for authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, avatarUrl: true }
                }
              }
            }
          }
        }
      }
    });

    const groups = memberships.map(m => m.group);
    return res.json(groups);
  } catch (error) {
    console.error('Fetch groups error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create group
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, memberUserIds } = req.body;
    const creatorId = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Combine creator and added members, ensuring uniqueness
    const userIds = Array.from(new Set([creatorId, ...(memberUserIds || [])]));

    const group = await prisma.group.create({
      data: {
        name,
        description,
        members: {
          create: userIds.map((userId) => ({
            userId
          }))
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true }
            }
          }
        }
      }
    });

    return res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get group details by ID, including balance calculations
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.id;

    // Check if user is member
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied: not a member of this group' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true }
            }
          }
        },
        expenses: {
          include: {
            paidBy: {
              select: { id: true, name: true, avatarUrl: true }
            },
            splits: {
              include: {
                user: {
                  select: { id: true, name: true, avatarUrl: true }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        settlements: {
          include: {
            payer: { select: { id: true, name: true, avatarUrl: true } },
            receiver: { select: { id: true, name: true, avatarUrl: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Format members list for balance functions
    const membersList = group.members.map(m => m.user);

    // Format expenses list
    const formattedExpenses = group.expenses.map(e => ({
      id: e.id,
      totalAmount: e.totalAmount,
      paidById: e.paidById,
      splits: e.splits.map(s => ({
        userId: s.userId,
        amount: s.amount
      }))
    }));

    // Calculate balances
    const netBalances = calculateNetBalances(membersList, formattedExpenses, group.settlements);
    const directDebts = getDirectDebts(membersList, formattedExpenses, group.settlements);
    const simplifiedDebts = getSimplifiedDebts(membersList, netBalances);

    return res.json({
      group,
      balances: {
        netBalances,
        directDebts,
        simplifiedDebts
      }
    });
  } catch (error) {
    console.error('Fetch group details error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Add members to a group (supports userIds or email + name invitation)
router.post('/:id/members', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    const { userIds, name, email } = req.body;

    // Verify requesting user is in group
    const requesterMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: req.user.id }
      }
    });

    if (!requesterMembership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // A. Invitation / Create placeholder user logic
    if (email && name) {
      let targetUser = await prisma.user.findUnique({ where: { email } });
      
      if (!targetUser) {
        const passwordHash = await bcrypt.hash('placeholder_pass_' + Math.random(), 10);
        targetUser = await prisma.user.create({
          data: {
            email,
            name,
            passwordHash,
            avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`
          }
        });
      }

      try {
        const member = await prisma.groupMember.create({
          data: { groupId, userId: targetUser.id },
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        });
        return res.json({ message: 'Member invited successfully', newMembers: [member] });
      } catch (err) {
        return res.status(400).json({ error: 'User is already a member of this group' });
      }
    }

    // B. Default checklist logic
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array, or email and name, are required' });
    }

    const newMembers = [];
    for (const userId of userIds) {
      try {
        const member = await prisma.groupMember.create({
          data: { groupId, userId },
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        });
        newMembers.push(member);
      } catch (err) {
        // Ignore duplicate memberships
      }
    }

    return res.json({ message: 'Members added successfully', newMembers });
  } catch (error) {
    console.error('Add members error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove a member from group with balance verification
router.delete('/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    const targetUserId = req.params.userId;
    const requesterId = req.user.id;

    // Check if requester is in group
    const requesterMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: requesterId }
      }
    });

    if (!requesterMembership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: { include: { user: true } },
        expenses: { include: { splits: true } },
        settlements: true
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const membersList = group.members.map(m => m.user);
    const formattedExpenses = group.expenses.map(e => ({
      id: e.id,
      totalAmount: e.totalAmount,
      paidById: e.paidById,
      splits: e.splits.map(s => ({
        userId: s.userId,
        amount: s.amount
      }))
    }));

    const netBalances = calculateNetBalances(membersList, formattedExpenses, group.settlements);
    const targetBalance = netBalances[targetUserId] || 0;

    if (Math.abs(targetBalance) > 0.01) {
      return res.status(400).json({
        error: `Cannot remove member with outstanding balances. User balance is ${targetBalance > 0 ? '+' : ''}${targetBalance.toFixed(2)}.`
      });
    }

    await prisma.groupMember.delete({
      where: {
        groupId_userId: { groupId, userId: targetUserId }
      }
    });

    return res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /import-csv: Ingests expense sheet CSV data
router.post('/import-csv', authenticateToken, async (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText) {
      return res.status(400).json({ error: 'csvText is required' });
    }

    // Helper functions
    function parseCSV(text) {
      const lines = [];
      let row = [""];
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row.push("");
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
          if (char === '\r' && nextChar === '\n') i++;
          lines.push(row);
          row = [""];
        } else {
          row[row.length - 1] += char;
        }
      }
      if (row.length > 1 || row[0] !== "") {
        lines.push(row);
      }
      return lines;
    }

    function normalizeName(name) {
      if (!name) return "";
      let clean = name.trim();
      if (clean.toLowerCase() === 'priya s') clean = 'Priya';
      if (clean.toLowerCase() === 'priya') clean = 'Priya';
      if (clean.toLowerCase() === 'rohan') clean = 'Rohan';
      if (clean.toLowerCase() === 'aisha') clean = 'Aisha';
      if (clean.toLowerCase() === 'meera') clean = 'Meera';
      if (clean.toLowerCase() === 'dev') clean = 'Dev';
      if (clean.toLowerCase() === 'sam') clean = 'Sam';
      if (clean.toLowerCase() === 'kabir') clean = 'Kabir';
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    function parseDate(dateStr) {
      if (!dateStr) return new Date();
      let clean = dateStr.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        return new Date(clean);
      }
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(clean)) {
        const [d, m, y] = clean.split('/');
        return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
      }
      if (/^[A-Za-z]{3}\s+\d{1,2}$/.test(clean)) {
        const [mon, day] = clean.split(/\s+/);
        const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
        const m = months[mon.toLowerCase().slice(0, 3)] || '01';
        return new Date(`2026-${m}-${day.padStart(2, '0')}`);
      }
      return new Date(clean);
    }

    function parseSplitDetails(detailsStr) {
      const parts = {};
      if (!detailsStr) return parts;
      const items = detailsStr.split(';');
      for (const item of items) {
        const cleanItem = item.trim();
        if (!cleanItem) continue;
        const lastSpace = cleanItem.lastIndexOf(' ');
        if (lastSpace === -1) continue;
        const name = normalizeName(cleanItem.slice(0, lastSpace));
        let valStr = cleanItem.slice(lastSpace + 1).replace('%', '').trim();
        const val = parseFloat(valStr) || 0;
        if (name) parts[name] = val;
      }
      return parts;
    }

    const rows = parseCSV(csvText);
    if (rows.length < 2) {
      return res.status(400).json({ error: 'CSV does not contain any data' });
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const dateIdx = headers.indexOf('date');
    const descIdx = headers.indexOf('description');
    const paidByIdx = headers.indexOf('paid_by');
    const amountIdx = headers.indexOf('amount');
    const currencyIdx = headers.indexOf('currency');
    const splitTypeIdx = headers.indexOf('split_type');
    const splitWithIdx = headers.indexOf('split_with');
    const splitDetailsIdx = headers.indexOf('split_details');
    const notesIdx = headers.indexOf('notes');

    const anomalies = [];
    const processedRows = new Set();
    const userCache = {}; // name -> User

    // Function to get or create placeholder user
    async function getOrCreateUser(name) {
      const normName = normalizeName(name);
      if (!normName) return null;
      if (userCache[normName]) return userCache[normName];

      let user = await prisma.user.findFirst({
        where: { name: normName }
      });

      if (!user) {
        // Find by email or generate one
        const email = normName.toLowerCase() + '@example.com';
        user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          const passwordHash = await bcrypt.hash('placeholder_pass_' + Math.random(), 10);
          user = await prisma.user.create({
            data: {
              email,
              name: normName,
              passwordHash,
              avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(normName)}`
            }
          });
        }
      }
      userCache[normName] = user;
      return user;
    }

    // 1. First pass: scan and create all users in the CSV to add them to the group
    const allUniqueNames = new Set();
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length < 2) continue;
      
      const rawPayer = row[paidByIdx] || "";
      const rawSplitWith = row[splitWithIdx] || "";

      if (rawPayer.trim()) {
        allUniqueNames.add(normalizeName(rawPayer));
      }
      if (rawSplitWith.trim()) {
        rawSplitWith.split(';').forEach(name => {
          if (name.trim()) allUniqueNames.add(normalizeName(name));
        });
      }
    }

    const groupMembers = [];
    for (const name of allUniqueNames) {
      const u = await getOrCreateUser(name);
      if (u) groupMembers.push(u);
    }

    // Create the group
    const groupName = "Co-living Flatmates (Imported)";
    const groupDesc = "Imported from expenses_export.csv";
    const group = await prisma.group.create({
      data: {
        name: groupName,
        description: groupDesc,
        members: {
          create: groupMembers.map(u => ({ userId: u.id }))
        }
      }
    });

    let importedExpenses = 0;
    let importedSettlements = 0;

    // 2. Second pass: Process rows and create expense / settlement records
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length < 2) continue; // skip blank rows

      const rawDate = row[dateIdx] || "";
      const rawDesc = row[descIdx] || "";
      const rawPayerName = row[paidByIdx] || "";
      const rawAmount = row[amountIdx] || "";
      let rawCurrency = row[currencyIdx] || "";
      let rawSplitType = row[splitTypeIdx] || "";
      const rawSplitWith = row[splitWithIdx] || "";
      const rawSplitDetails = row[splitDetailsIdx] || "";
      const rawNotes = row[notesIdx] || "";

      const rowNum = r + 1; // row number in CSV file (1-indexed, including header)

      // A. Check missing payer
      const normalizedPayer = normalizeName(rawPayerName);
      if (!normalizedPayer) {
        anomalies.push({
          row: rowNum,
          type: "CRITICAL",
          field: "paid_by",
          message: `Missing payer name for row "${rawDesc}". Expense skipped.`,
          action: "SKIPPED"
        });
        continue;
      }

      // B. Parse & Clean Amount
      let cleanAmountStr = rawAmount.replace(/["\s,]/g, "");
      let amount = parseFloat(cleanAmountStr);
      if (isNaN(amount)) {
        anomalies.push({
          row: rowNum,
          type: "CRITICAL",
          field: "amount",
          message: `Invalid amount format "${rawAmount}" for row "${rawDesc}". Expense skipped.`,
          action: "SKIPPED"
        });
        continue;
      }

      // Check zero amount
      if (amount === 0) {
        anomalies.push({
          row: rowNum,
          type: "WARNING",
          field: "amount",
          message: `Zero amount logged for row "${rawDesc}". Row skipped.`,
          action: "SKIPPED"
        });
        continue;
      }

      // Rounding adjustment
      const roundedAmount = Math.round(amount * 100) / 100;
      if (roundedAmount !== amount) {
        anomalies.push({
          row: rowNum,
          type: "INFO",
          field: "amount",
          message: `Precision rounding: converted "${amount}" to "${roundedAmount.toFixed(2)}".`,
          action: "ROUNDED"
        });
        amount = roundedAmount;
      }

      // C. Check Duplicates / Double Logging
      const duplicateKey = `${rawDate.trim()}|${normalizedPayer}|${amount}|${rawDesc.trim().toLowerCase()}`;
      if (processedRows.has(duplicateKey)) {
        anomalies.push({
          row: rowNum,
          type: "WARNING",
          field: "row",
          message: `Duplicate entry detected for "${rawDesc}" on ${rawDate} ($${amount}). Row skipped.`,
          action: "SKIPPED"
        });
        continue;
      }
      processedRows.add(duplicateKey);

      // D. Parse Currency & Exchange Rates
      let rate = 1.0;
      if (!rawCurrency.trim()) {
        anomalies.push({
          row: rowNum,
          type: "INFO",
          field: "currency",
          message: `Missing currency for "${rawDesc}". Defaulted to INR.`,
          action: "DEFAULTED"
        });
        rawCurrency = "INR";
      }

      if (rawCurrency.toUpperCase() === 'USD') {
        rate = 83.0; // Exchange rate USD -> INR
        const converted = Math.round(amount * rate * 100) / 100;
        anomalies.push({
          row: rowNum,
          type: "INFO",
          field: "currency",
          message: `Multi-currency: converted $${amount} USD to $${converted} INR using fixed rate 83.0.`,
          action: "CONVERTED"
        });
        amount = converted;
        rawCurrency = "INR";
      }

      // E. Parse Date
      const date = parseDate(rawDate);

      // F. Resolve Payer User ID
      const payerUser = await getOrCreateUser(normalizedPayer);

      // G. Parse split members
      let splitMembersNames = rawSplitWith.split(';').map(n => normalizeName(n)).filter(n => !!n);
      if (splitMembersNames.length === 0) {
        // Default to all members in group
        splitMembersNames = groupMembers.map(u => u.name);
      }

      const splitUsers = [];
      for (const name of splitMembersNames) {
        const u = await getOrCreateUser(name);
        if (u) splitUsers.push(u);
      }

      // H. Check if Settlement or Expense
      const isSettlement = !rawSplitType.trim() && rawSplitWith && !rawSplitDetails && rawDesc.toLowerCase().includes("paid");
      if (isSettlement) {
        // Record as Settlement
        const receiverUser = await getOrCreateUser(rawSplitWith);
        if (receiverUser && payerUser) {
          await prisma.settlement.create({
            data: {
              groupId: group.id,
              payerId: payerUser.id,
              receiverId: receiverUser.id,
              amount,
              createdAt: date
            }
          });
          importedSettlements++;
          anomalies.push({
            row: rowNum,
            type: "INFO",
            field: "split_type",
            message: `Recorded "${rawDesc}" as direct debt payment from ${payerUser.name} to ${receiverUser.name}.`,
            action: "SETTLEMENT"
          });
          continue;
        }
      }

      // Standardize split type
      let splitType = rawSplitType.trim().toUpperCase();
      if (!splitType) {
        splitType = "EQUAL";
      }

      // I. Create Expense Splits
      const splitsData = [];

      if (splitType === 'PERCENTAGE') {
        const percentageMap = parseSplitDetails(rawSplitDetails);
        let sumPct = 0;
        splitUsers.forEach(u => {
          sumPct += percentageMap[u.name] || 0;
        });

        // Flag percentage anomaly
        if (Math.abs(sumPct - 100) > 0.01) {
          anomalies.push({
            row: rowNum,
            type: "WARNING",
            field: "split_details",
            message: `Percentages sum to ${sumPct}% (should be 100%). Normalizing splits proportionally.`,
            action: "NORMALIZED"
          });
          
          // Normalize percentages
          let scaleFactor = 100 / (sumPct || 1);
          let distributedAmount = 0;
          
          splitUsers.forEach((u, idx) => {
            const origPct = percentageMap[u.name] || 0;
            const normPct = origPct * scaleFactor;
            let splitAmt = Math.round((amount * normPct / 100) * 100) / 100;
            
            if (idx === splitUsers.length - 1) {
              splitAmt = Math.round((amount - distributedAmount) * 100) / 100;
            }
            distributedAmount += splitAmt;
            
            splitsData.push({
              userId: u.id,
              amount: splitAmt,
              percentage: normPct
            });
          });
        } else {
          let distributedAmount = 0;
          splitUsers.forEach((u, idx) => {
            const pct = percentageMap[u.name] || 0;
            let splitAmt = Math.round((amount * pct / 100) * 100) / 100;
            
            if (idx === splitUsers.length - 1) {
              splitAmt = Math.round((amount - distributedAmount) * 100) / 100;
            }
            distributedAmount += splitAmt;
            
            splitsData.push({
              userId: u.id,
              amount: splitAmt,
              percentage: pct
            });
          });
        }
      } else if (splitType === 'SHARE') {
        const shareMap = parseSplitDetails(rawSplitDetails);
        let totalShares = 0;
        splitUsers.forEach(u => {
          totalShares += shareMap[u.name] || 1;
        });

        let distributedAmount = 0;
        splitUsers.forEach((u, idx) => {
          const shares = shareMap[u.name] || 1;
          let splitAmt = Math.round((amount * shares / totalShares) * 100) / 100;
          
          if (idx === splitUsers.length - 1) {
            splitAmt = Math.round((amount - distributedAmount) * 100) / 100;
          }
          distributedAmount += splitAmt;
          
          splitsData.push({
            userId: u.id,
            amount: splitAmt,
            shares
          });
        });
      } else if (splitType === 'UNEQUAL') {
        const amountMap = parseSplitDetails(rawSplitDetails);
        let sumAmt = 0;
        splitUsers.forEach(u => {
          sumAmt += amountMap[u.name] || 0;
        });

        if (Math.abs(sumAmt - amount) > 0.02) {
          anomalies.push({
            row: rowNum,
            type: "WARNING",
            field: "split_details",
            message: `Unequal splits sum to $${sumAmt.toFixed(2)} (total is $${amount.toFixed(2)}). Scaling splits proportionally.`,
            action: "NORMALIZED"
          });
          
          let scaleFactor = amount / (sumAmt || 1);
          let distributedAmount = 0;
          splitUsers.forEach((u, idx) => {
            const origAmt = amountMap[u.name] || 0;
            let splitAmt = Math.round((origAmt * scaleFactor) * 100) / 100;
            if (idx === splitUsers.length - 1) {
              splitAmt = Math.round((amount - distributedAmount) * 100) / 100;
            }
            distributedAmount += splitAmt;
            splitsData.push({
              userId: u.id,
              amount: splitAmt
            });
          });
        } else {
          let distributedAmount = 0;
          splitUsers.forEach((u, idx) => {
            let splitAmt = amountMap[u.name] || 0;
            if (idx === splitUsers.length - 1) {
              splitAmt = Math.round((amount - distributedAmount) * 100) / 100;
            }
            distributedAmount += splitAmt;
            splitsData.push({
              userId: u.id,
              amount: splitAmt
            });
          });
        }
      } else {
        // EQUAL split
        let splitAmt = Math.round((amount / splitUsers.length) * 100) / 100;
        let distributedAmount = 0;
        splitUsers.forEach((u, idx) => {
          let currentSplitAmt = splitAmt;
          if (idx === splitUsers.length - 1) {
            currentSplitAmt = Math.round((amount - distributedAmount) * 100) / 100;
          }
          distributedAmount += currentSplitAmt;
          splitsData.push({
            userId: u.id,
            amount: currentSplitAmt
          });
        });

        // Check if EQUAL split has extraneous share details (like row 42)
        if (rawSplitDetails.trim()) {
          anomalies.push({
            row: rowNum,
            type: "INFO",
            field: "split_details",
            message: `Equal split type specified, ignoring redundant split details "${rawSplitDetails}".`,
            action: "IGNORED_DETAILS"
          });
        }
      }

      // Create the expense record
      await prisma.expense.create({
        data: {
          groupId: group.id,
          title: rawDesc.trim(),
          totalAmount: amount,
          paidById: payerUser.id,
          splitType,
          createdAt: date,
          splits: {
            create: splitsData.map(s => ({
              userId: s.userId,
              amount: s.amount,
              percentage: s.percentage,
              shares: s.shares
            }))
          }
        }
      });
      importedExpenses++;
    }

    return res.json({
      message: 'CSV imported successfully',
      groupId: group.id,
      groupName,
      totalRows: rows.length - 1,
      importedExpenses,
      importedSettlements,
      anomalies
    });

  } catch (error) {
    console.error('CSV Import error:', error);
    return res.status(500).json({ error: 'Internal server error during CSV ingestion' });
  }
});

export default router;
