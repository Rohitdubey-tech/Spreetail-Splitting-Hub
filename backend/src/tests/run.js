import { calculateNetBalances, getDirectDebts, getSimplifiedDebts } from '../utils/balances.js';

const mockMembers = [
  { id: '1', name: 'Alice', avatarUrl: null },
  { id: '2', name: 'Bob', avatarUrl: null },
  { id: '3', name: 'Charlie', avatarUrl: null },
];

function runTests() {
  console.log('🧪 Running Splitwise Balance Engine Tests in JavaScript...\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ Passed: ${message}`);
    } else {
      console.error(`❌ Failed: ${message}`);
    }
  }

  // TEST 1: Equal splits & net balances
  try {
    const expenses = [
      {
        id: 'e1',
        totalAmount: 90,
        paidById: '1', // Alice paid 90
        splits: [
          { userId: '1', amount: 30 },
          { userId: '2', amount: 30 },
          { userId: '3', amount: 30 }
        ]
      }
    ];
    const settlements = [];

    const balances = calculateNetBalances(mockMembers, expenses, settlements);

    assert(balances['1'] === 60, `Alice net balance is +60 (got ${balances['1']})`);
    assert(balances['2'] === -30, `Bob net balance is -30 (got ${balances['2']})`);
    assert(balances['3'] === -30, `Charlie net balance is -30 (got ${balances['3']})`);
  } catch (e) {
    assert(false, `Test 1 threw error: ${e.message}`);
  }

  // TEST 2: Rounding errors & precision
  try {
    const expenses = [
      {
        id: 'e2',
        totalAmount: 10,
        paidById: '1', // Alice paid 10
        splits: [
          { userId: '1', amount: 3.34 }, // Alice gets the extra cent
          { userId: '2', amount: 3.33 },
          { userId: '3', amount: 3.33 }
        ]
      }
    ];
    const settlements = [];
    const balances = calculateNetBalances(mockMembers, expenses, settlements);

    assert(balances['1'] === 6.66, `Alice net balance is +6.66 (got ${balances['1']})`);
    assert(balances['2'] === -3.33, `Bob net balance is -3.33 (got ${balances['2']})`);
  } catch (e) {
    assert(false, `Test 2 threw error: ${e.message}`);
  }

  // TEST 3: Debt simplification
  try {
    const netBalances = {
      '1': 50,  // Alice
      '2': -30, // Bob
      '3': -20  // Charlie
    };
    const simplified = getSimplifiedDebts(mockMembers, netBalances);

    assert(simplified.length === 2, `Simplifies to exactly 2 transactions (got ${simplified.length})`);
    
    const bobToAlice = simplified.find(d => d.fromUser.id === '2' && d.toUser.id === '1');
    const charlieToAlice = simplified.find(d => d.fromUser.id === '3' && d.toUser.id === '1');

    assert(!!bobToAlice && bobToAlice.amount === 30, `Bob owes Alice $30`);
    assert(!!charlieToAlice && charlieToAlice.amount === 20, `Charlie owes Alice $20`);
  } catch (e) {
    assert(false, `Test 3 threw error: ${e.message}`);
  }

  // TEST 4: Multi-stage direct vs simplified
  try {
    const mockMembers2 = [
      { id: 'A', name: 'Alice', avatarUrl: null },
      { id: 'B', name: 'Bob', avatarUrl: null },
      { id: 'C', name: 'Charlie', avatarUrl: null }
    ];
    const expenses = [
      { id: 'e1', totalAmount: 10, paidById: 'B', splits: [{ userId: 'A', amount: 10 }] }, // A owes B 10
      { id: 'e2', totalAmount: 10, paidById: 'C', splits: [{ userId: 'B', amount: 10 }] }  // B owes C 10
    ];
    const settlements = [];

    const direct = getDirectDebts(mockMembers2, expenses, settlements);
    assert(direct.length === 2, `Direct has 2 transactions (got ${direct.length})`);

    const netBalances = calculateNetBalances(mockMembers2, expenses, settlements);
    const simplified = getSimplifiedDebts(mockMembers2, netBalances);
    assert(simplified.length === 1, `Simplified has 1 transaction (got ${simplified.length})`);
    assert(simplified[0].fromUser.id === 'A' && simplified[0].toUser.id === 'C' && simplified[0].amount === 10, `Alice pays Charlie $10 directly`);
  } catch (e) {
    assert(false, `Test 4 threw error: ${e.message}`);
  }

  console.log(`\n📊 Test Summary: ${passed}/${total} assertions passed.`);
  process.exit(passed === total ? 0 : 1);
}

runTests();
