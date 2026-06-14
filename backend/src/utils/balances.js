// Calculate Net Balance for each user in the group (Credits - Debits)
export const calculateNetBalances = (members, expenses, settlements) => {
  const balances = {};
  
  // Initialize all member balances to 0
  members.forEach(member => {
    balances[member.id] = 0;
  });

  // Calculate effect of expenses
  expenses.forEach(expense => {
    const payerId = expense.paidById;
    
    // Add total amount to payer's credits (if they are a member)
    if (balances[payerId] !== undefined) {
      balances[payerId] += expense.totalAmount;
    }

    // Subtract split amount from each split participant's balance
    expense.splits.forEach(split => {
      if (balances[split.userId] !== undefined) {
        balances[split.userId] -= split.amount;
      }
    });
  });

  // Calculate effect of settlements
  settlements.forEach(settlement => {
    const payerId = settlement.payerId;
    const receiverId = settlement.receiverId;

    if (balances[payerId] !== undefined) {
      balances[payerId] += settlement.amount; // Paid money, increases net balance
    }
    if (balances[receiverId] !== undefined) {
      balances[receiverId] -= settlement.amount; // Received money, decreases net balance
    }
  });

  // Fix float precision issues (round to 2 decimal places)
  Object.keys(balances).forEach(userId => {
    balances[userId] = Math.round(balances[userId] * 100) / 100;
  });

  return balances;
};

// Calculate Direct Debits (raw transaction history between each user, resolved pairwise)
export const getDirectDebts = (members, expenses, settlements) => {
  const userMap = new Map(members.map(m => [m.id, m]));
  
  // Create a 2D matrix of debts: debtMatrix[A][B] = A owes B
  const debtMatrix = {};
  
  members.forEach(m1 => {
    debtMatrix[m1.id] = {};
    members.forEach(m2 => {
      debtMatrix[m1.id][m2.id] = 0;
    });
  });

  // Apply expenses: Split participant owes the Payer
  expenses.forEach(expense => {
    const payerId = expense.paidById;
    expense.splits.forEach(split => {
      if (split.userId !== payerId && debtMatrix[split.userId] && debtMatrix[split.userId][payerId] !== undefined) {
        debtMatrix[split.userId][payerId] += split.amount;
      }
    });
  });

  // Apply settlements: Payer pays Receiver, reducing direct debt
  settlements.forEach(settlement => {
    const { payerId, receiverId, amount } = settlement;
    if (debtMatrix[payerId] && debtMatrix[payerId][receiverId] !== undefined) {
      debtMatrix[payerId][receiverId] -= amount;
    }
  });

  // Resolve pairwise net debts
  const debts = [];
  
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const u1 = members[i].id;
      const u2 = members[j].id;

      let netOwed = debtMatrix[u1][u2] - debtMatrix[u2][u1];
      netOwed = Math.round(netOwed * 100) / 100;

      if (netOwed > 0.01) {
        debts.push({
          fromUser: userMap.get(u1),
          toUser: userMap.get(u2),
          amount: netOwed
        });
      } else if (netOwed < -0.01) {
        debts.push({
          fromUser: userMap.get(u2),
          toUser: userMap.get(u1),
          amount: Math.abs(netOwed)
        });
      }
    }
  }

  return debts;
};

// Calculate Simplified Debts (minimizes total transactions using a greedy approach)
export const getSimplifiedDebts = (members, netBalances) => {
  const userMap = new Map(members.map(m => [m.id, m]));
  const debts = [];

  // Separate members into debtors and creditors
  let participants = Object.keys(netBalances).map(userId => ({
    userId,
    balance: netBalances[userId]
  }));

  while (true) {
    // Sort balances
    participants.sort((a, b) => a.balance - b.balance);

    const debtor = participants[0]; // Most negative
    const creditor = participants[participants.length - 1]; // Most positive

    if (!debtor || !creditor || Math.abs(debtor.balance) < 0.01 || Math.abs(creditor.balance) < 0.01) {
      break;
    }

    const settleAmount = Math.min(Math.abs(debtor.balance), creditor.balance);
    
    const fromUser = userMap.get(debtor.userId);
    const toUser = userMap.get(creditor.userId);

    if (fromUser && toUser && settleAmount > 0.01) {
      debts.push({
        fromUser,
        toUser,
        amount: Math.round(settleAmount * 100) / 100
      });
    }

    debtor.balance += settleAmount;
    creditor.balance -= settleAmount;
  }

  return debts;
};
