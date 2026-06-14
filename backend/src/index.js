import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import expenseRoutes from './routes/expenses.js';
import settlementRoutes from './routes/settlements.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/settlements', settlementRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Spreetail Splitwise Server is healthy' });
});

// Socket.io Real-Time Expense Chat Configuration
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Join a room for a specific expense
  socket.on('join_expense', ({ expenseId }) => {
    socket.join(expenseId);
    console.log(`👥 Socket ${socket.id} joined room/expense: ${expenseId}`);
  });

  // Leave room
  socket.on('leave_expense', ({ expenseId }) => {
    socket.leave(expenseId);
    console.log(`👥 Socket ${socket.id} left room/expense: ${expenseId}`);
  });

  // Handle new chat message
  socket.on('send_message', async ({ expenseId, userId, message }) => {
    try {
      if (!expenseId || !userId || !message) {
        return;
      }

      // Save message to SQLite relational DB via Prisma
      const savedMessage = await prisma.chatMessage.create({
        data: {
          expenseId,
          userId,
          message
        },
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true }
          }
        }
      });

      // Broadcast the saved message to everyone in the room
      io.to(expenseId).emit('receive_message', savedMessage);
      console.log(`💬 Message broadcasted in ${expenseId} by ${userId}: "${message}"`);
    } catch (error) {
      console.error('Socket save message error:', error);
    }
  });

  // Clean up
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
  });
});

import bcrypt from 'bcryptjs';

const seedDemoData = async () => {
  try {
    const demoEmail = 'demo@example.com';
    const demoUser = await prisma.user.findUnique({ where: { email: demoEmail } });
    if (demoUser) {
      console.log('🌱 Demo data already seeded.');
      return;
    }

    console.log('🌱 Seeding demo data...');
    const passwordHash = await bcrypt.hash('password123', 10);

    // Create users
    const userDemo = await prisma.user.create({
      data: {
        email: 'demo@example.com',
        name: 'Demo User',
        passwordHash,
        avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Demo%20User'
      }
    });

    const userAlice = await prisma.user.create({
      data: {
        email: 'alice@example.com',
        name: 'Alice Smith',
        passwordHash,
        avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Alice%20Smith'
      }
    });

    const userBob = await prisma.user.create({
      data: {
        email: 'bob@example.com',
        name: 'Bob Jones',
        passwordHash,
        avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Bob%20Jones'
      }
    });

    const userCharlie = await prisma.user.create({
      data: {
        email: 'charlie@example.com',
        name: 'Charlie Brown',
        passwordHash,
        avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Charlie%20Brown'
      }
    });

    // Create a group
    const group = await prisma.group.create({
      data: {
        name: 'Demo Housemates',
        description: 'Shared expenses for the apartment',
        members: {
          create: [
            { userId: userDemo.id },
            { userId: userAlice.id },
            { userId: userBob.id },
            { userId: userCharlie.id }
          ]
        }
      }
    });

    // Create expenses
    // 1. Groceries split equally ($120 paid by Alice)
    const exp1 = await prisma.expense.create({
      data: {
        groupId: group.id,
        title: 'Groceries',
        totalAmount: 120,
        paidById: userAlice.id,
        splitType: 'EQUAL',
        splits: {
          create: [
            { userId: userDemo.id, amount: 30 },
            { userId: userAlice.id, amount: 30 },
            { userId: userBob.id, amount: 30 },
            { userId: userCharlie.id, amount: 30 }
          ]
        }
      }
    });

    // 2. Electricity Bill split equally ($200 paid by Demo User)
    const exp2 = await prisma.expense.create({
      data: {
        groupId: group.id,
        title: 'Electricity Bill',
        totalAmount: 200,
        paidById: userDemo.id,
        splitType: 'EQUAL',
        splits: {
          create: [
            { userId: userDemo.id, amount: 50 },
            { userId: userAlice.id, amount: 50 },
            { userId: userBob.id, amount: 50 },
            { userId: userCharlie.id, amount: 50 }
          ]
        }
      }
    });

    // 3. Dinner split unequally ($100 paid by Bob)
    const exp3 = await prisma.expense.create({
      data: {
        groupId: group.id,
        title: 'Dinner at Pizzeria',
        totalAmount: 100,
        paidById: userBob.id,
        splitType: 'UNEQUAL',
        splits: {
          create: [
            { userId: userDemo.id, amount: 40 },
            { userId: userAlice.id, amount: 30 },
            { userId: userBob.id, amount: 20 },
            { userId: userCharlie.id, amount: 10 }
          ]
        }
      }
    });

    // Create chat messages in exp2
    await prisma.chatMessage.create({
      data: {
        expenseId: exp2.id,
        userId: userAlice.id,
        message: 'Thanks for paying the electricity bill! I will settle up soon.'
      }
    });

    await prisma.chatMessage.create({
      data: {
        expenseId: exp2.id,
        userId: userDemo.id,
        message: 'No problem, take your time.'
      }
    });

    console.log('🌱 Demo data seeded successfully.');
  } catch (error) {
    console.error('❌ Seeding demo data failed:', error);
  }
};

// Start Server
server.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await seedDemoData();
});
