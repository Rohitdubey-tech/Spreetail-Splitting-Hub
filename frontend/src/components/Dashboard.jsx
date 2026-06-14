import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ExpenseModal from './ExpenseModal';
import SettleModal from './SettleModal';
import ChatPane from './ChatPane';

export const Dashboard = () => {
  const { user, logout, apiBaseUrl } = useAuth();
  
  const [groups, setGroups] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  
  // Dashboard Aggregates
  const [totalYouOwe, setTotalYouOwe] = useState(0);
  const [totalYouAreOwed, setTotalYouAreOwed] = useState(0);
  
  // Navigation tabs
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' or 'groups'
  
  // UI States
  const [isSimplifyDebts, setIsSimplifyDebts] = useState(true);
  const [activeExpenseDetail, setActiveExpenseDetail] = useState(null);
  
  // Modals Switches
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  
  // Forms states
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState([]);
  const [addMemberIds, setAddMemberIds] = useState([]);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  
  // Settlement fields pre-fill
  const [settlePayerId, setSettlePayerId] = useState('');
  const [settleReceiverId, setSettleReceiverId] = useState('');
  const [settleAmount, setSettleAmount] = useState(0);

  const [error, setError] = useState('');
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');

  // CSV Import States
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');

  const handleCSVImport = async (e) => {
    e.preventDefault();
    if (!csvText.trim()) return;

    setImportLoading(true);
    setImportError('');
    setError(''); // Clear general workspace access errors
    setImportResult(null);

    try {
      const res = await axios.post(`${apiBaseUrl}/groups/import-csv`, {
        csvText: csvText.trim()
      });
      setImportResult(res.data);
      setCsvText('');
      await fetchGroups();
    } catch (err) {
      setImportError(err.response?.data?.error || 'Failed to import CSV');
    } finally {
      setImportLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await axios.get(`${apiBaseUrl}/groups`);
      setGroups(res.data);
      calculateTotalBalances(res.data);
    } catch (err) {
      console.error('Failed to load groups', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${apiBaseUrl}/auth/users`);
      setAllUsers(res.data);
    } catch (err) {
      console.error('Failed to load users', err);
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchUsers();
  }, [apiBaseUrl]);

  const fetchGroupDetails = async (groupId) => {
    setLoadingDetails(true);
    setError('');
    try {
      const res = await axios.get(`${apiBaseUrl}/groups/${groupId}`);
      setGroupDetails(res.data);
      
      if (activeExpenseDetail) {
        const refreshedExpense = res.data.group.expenses.find((e) => e.id === activeExpenseDetail.id);
        if (refreshedExpense) {
          setActiveExpenseDetail(refreshedExpense);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load group details');
      setGroupDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (activeGroupId) {
      fetchGroupDetails(activeGroupId);
    } else {
      setGroupDetails(null);
      setActiveExpenseDetail(null);
      fetchGroups();
    }
  }, [activeGroupId]);

  const calculateTotalBalances = async (groupsList) => {
    let youOweSum = 0;
    let youAreOwedSum = 0;

    for (const g of groupsList) {
      try {
        const res = await axios.get(`${apiBaseUrl}/groups/${g.id}`);
        const netBalances = res.data.balances.netBalances;
        const userNet = netBalances[user?.id || ''] || 0;

        if (userNet > 0) {
          youAreOwedSum += userNet;
        } else if (userNet < 0) {
          youOweSum += Math.abs(userNet);
        }
      } catch (err) {
        console.error('Failed calculating balance for group', g.id);
      }
    }
    setTotalYouAreOwed(Math.round(youAreOwedSum * 100) / 100);
    setTotalYouOwe(Math.round(youOweSum * 100) / 100);
  };

  const handleCreateGroupSubmit = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      const res = await axios.post(`${apiBaseUrl}/groups`, {
        name: newGroupName.trim(),
        description: newGroupDesc.trim(),
        memberUserIds: newGroupMembers
      });
      
      setNewGroupName('');
      setNewGroupDesc('');
      setNewGroupMembers([]);
      setIsGroupModalOpen(false);
      
      await fetchGroups();
      setActiveGroupId(res.data.id);
      setActiveTab('groups');
    } catch (err) {
      console.error('Failed to create group', err);
    }
  };

  const handleAddMembersSubmit = async (e) => {
    e.preventDefault();
    if (addMemberIds.length === 0 || !activeGroupId) return;

    try {
      await axios.post(`${apiBaseUrl}/groups/${activeGroupId}/members`, {
        userIds: addMemberIds
      });
      setAddMemberIds([]);
      setIsMemberModalOpen(false);
      fetchGroupDetails(activeGroupId);
    } catch (err) {
      console.error('Failed to add members', err);
    }
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    setInviteError('');
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError('Name and email are required');
      return;
    }

    try {
      await axios.post(`${apiBaseUrl}/groups/${activeGroupId}/members`, {
        name: inviteName.trim(),
        email: inviteEmail.trim()
      });
      setInviteName('');
      setInviteEmail('');
      setIsMemberModalOpen(false);
      fetchGroupDetails(activeGroupId);
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Failed to invite member');
    }
  };

  const handleRemoveMember = async (targetUserId, name) => {
    if (!activeGroupId) return;
    if (!window.confirm(`Are you sure you want to remove ${name} from this group?`)) return;

    try {
      await axios.delete(`${apiBaseUrl}/groups/${activeGroupId}/members/${targetUserId}`);
      fetchGroupDetails(activeGroupId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove member');
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!activeGroupId) return;
    if (!window.confirm('Are you sure you want to delete this expense?')) return;

    try {
      await axios.delete(`${apiBaseUrl}/expenses/${expenseId}`);
      setActiveExpenseDetail(null);
      fetchGroupDetails(activeGroupId);
    } catch (err) {
      console.error('Failed to delete expense', err);
    }
  };

  const handleRevertSettlement = async (settlementId) => {
    if (!activeGroupId) return;
    if (!window.confirm('Are you sure you want to delete this payment record? This will restore the outstanding debt.')) return;

    try {
      await axios.delete(`${apiBaseUrl}/settlements/${settlementId}`);
      fetchGroupDetails(activeGroupId);
    } catch (err) {
      console.error('Failed to revert settlement', err);
    }
  };

  const handleQuickSettle = (debt) => {
    setSettlePayerId(debt.fromUser.id);
    setSettleReceiverId(debt.toUser.id);
    setSettleAmount(debt.amount);
    setIsSettleModalOpen(true);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatMonth = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: 'short' }).toUpperCase();
  };

  const formatDay = (dateStr) => {
    const d = new Date(dateStr);
    return d.getDate();
  };

  const renderExpenseRelation = (expense) => {
    const currentUserId = user?.id || '';
    const payerId = expense.paidById;
    const isPayer = payerId === currentUserId;
    
    const userSplit = expense.splits.find(s => s.userId === currentUserId);

    if (!userSplit) {
      return (
        <>
          <span className="rel-text">Not involved</span>
          <span className="rel-amount" style={{ color: 'var(--text-muted)' }}>$0.00</span>
        </>
      );
    }

    if (isPayer) {
      const owed = expense.totalAmount - userSplit.amount;
      return (
        <>
          <span className="rel-text">You lent</span>
          <span className="rel-amount positive">${owed.toFixed(2)}</span>
        </>
      );
    } else {
      return (
        <>
          <span className="rel-text">{expense.paidBy.name} paid</span>
          <span className="rel-amount negative">You owe ${userSplit.amount.toFixed(2)}</span>
        </>
      );
    }
  };

  const getActiveUserBalance = () => {
    if (!groupDetails || !user) return 0;
    return groupDetails.balances.netBalances[user.id] || 0;
  };

  return (
    <div className="app-container" style={{ flexDirection: 'column' }}>
      {/* ================= 1. PREMIUM TOP NAVIGATION HUB ================= */}
      <header className="app-header glass">
        <div className="header-logo">
          <div className="logo-icon">S</div>
          <span className="logo-text">Spreetail Splitting Hub</span>
        </div>
        
        <nav className="nav-tabs">
          <button 
            className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setActiveTab('dashboard'); setActiveGroupId(null); setError(''); }}
          >
            🏠 Home Hub
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => { 
              setActiveTab('groups');
              setError('');
              if (!activeGroupId && groups.length > 0) {
                setActiveGroupId(groups[0].id);
              }
            }}
          >
            👥 Groups Workspace {activeGroupId && `(${groups.find(g => g.id === activeGroupId)?.name || ''})`}
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => { setActiveTab('import'); setActiveGroupId(null); setError(''); }}
          >
            📥 Import CSV
          </button>
        </nav>

        {user && (
          <div className="header-user-profile">
            <img 
              className="avatar-sm" 
              src={user.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`} 
              alt={user.name} 
            />
            <span className="profile-name">{user.name}</span>
            <button className="logout-btn-nav" onClick={logout}>
              Sign Out
            </button>
          </div>
        )}
      </header>

      {/* ================= 2. WORKSPACE WRAPPER ================= */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', width: '100%' }}>
        <main className="dashboard-main" style={{ width: '100%' }}>
          
          {error && (
            <div className="error-banner" style={{ margin: '20px' }}>
              {error}
            </div>
          )}

          {activeTab === 'dashboard' && (
            /* ================= VIEW A: HOME DASHBOARD HUB ================= */
            <div className="main-feed" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '40px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h1 className="group-title" style={{ fontSize: '2rem' }}>Personal Hub</h1>
                  <p className="group-desc">Monitor splits and balances across all circles</p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setNewGroupName('');
                    setNewGroupDesc('');
                    setNewGroupMembers([]);
                    setIsGroupModalOpen(true);
                  }}
                >
                  Create New Group
                </button>
              </div>

              {/* Net Balance Overview Widget */}
              <div className="card glass" style={{ marginBottom: '28px' }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Aggregate Balances
                </h2>
                <div className="overall-summary">
                  <div className="summary-tile positive">
                    <span className="tile-label">You are owed</span>
                    <span className="tile-value positive">${totalYouAreOwed.toFixed(2)}</span>
                  </div>
                  <div className="summary-tile negative">
                    <span className="tile-label">You owe</span>
                    <span className="tile-value negative">${totalYouOwe.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Interactive Grid of Groups */}
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '16px' }}>My Active Circles</h2>
                {groups.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '50px 20px' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>You don't belong to any groups yet.</p>
                    <button 
                      className="btn btn-primary" 
                      style={{ margin: '16px auto 0 auto' }}
                      onClick={() => setIsGroupModalOpen(true)}
                    >
                      Create your first group
                    </button>
                  </div>
                ) : (
                  <div className="groups-card-grid">
                    {groups.map(g => (
                      <div 
                        key={g.id} 
                        className="group-hub-card card glass"
                        onClick={() => {
                          setActiveGroupId(g.id);
                          setActiveTab('groups');
                        }}
                      >
                        <div className="group-card-header">
                          <div className="group-hub-icon">👥</div>
                          <h3 className="group-hub-title">{g.name}</h3>
                        </div>
                        <p className="group-hub-desc">{g.description || 'No description provided.'}</p>
                        <div className="group-hub-meta">
                          <span>{g.members?.length || 0} Member(s)</span>
                          <span className="enter-action">Enter Workspace &rarr;</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'groups' && (
            /* ================= VIEW B: GROUPS WORKSPACE ================= */
            <div className="dashboard-content" style={{ gridTemplateColumns: '260px 1fr 340px' }}>
              
              {/* Left Column: Compact Group switcher */}
              <aside className="group-switcher-bar">
                <div className="switcher-header">
                  <span>Groups Workspace</span>
                </div>
                <div className="switcher-list">
                  {groups.map(g => (
                    <button
                      key={g.id}
                      className={`switcher-item ${activeGroupId === g.id ? 'active' : ''}`}
                      onClick={() => setActiveGroupId(g.id)}
                    >
                      <span className="switcher-icon">👥</span>
                      <span className="switcher-name">{g.name}</span>
                    </button>
                  ))}
                  <button
                    className="switcher-add-btn"
                    onClick={() => {
                      setNewGroupName('');
                      setNewGroupDesc('');
                      setNewGroupMembers([]);
                      setIsGroupModalOpen(true);
                    }}
                  >
                    + Create Group
                  </button>
                </div>
              </aside>

              {/* Center Column: selected group feed */}
              {loadingDetails ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', gridColumn: 'span 2' }}>
                  Loading workspace details...
                </div>
              ) : groupDetails ? (
                <>
                  <div className="main-feed" style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '18px' }}>
                      <div>
                        <h1 className="group-title" style={{ fontSize: '1.8rem' }}>{groupDetails.group.name}</h1>
                        <p className="group-desc">{groupDetails.group.description || 'No description'}</p>
                      </div>
                      <div className="header-actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setAddMemberIds([]);
                            setIsMemberModalOpen(true);
                          }}
                        >
                          Add Member
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setExpenseToEdit(null);
                            setIsExpenseModalOpen(true);
                          }}
                        >
                          Add Expense
                        </button>
                      </div>
                    </div>

                    <div className="expenses-section-header" style={{ marginTop: '12px' }}>
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Workspace Bills</h2>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {groupDetails.group.expenses.length} expense(s)
                      </span>
                    </div>

                    <div className="expenses-list">
                      {groupDetails.group.expenses.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '50px 20px' }}>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No expenses recorded in this workspace.</p>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ margin: '14px auto 0 auto' }}
                            onClick={() => {
                              setExpenseToEdit(null);
                              setIsExpenseModalOpen(true);
                            }}
                          >
                            Create first bill
                          </button>
                        </div>
                      ) : (
                        groupDetails.group.expenses.map(exp => (
                          <div
                            key={exp.id}
                            className="expense-card"
                            onClick={() => setActiveExpenseDetail(exp)}
                          >
                            <div className="expense-left">
                              <div className="expense-date">
                                <span>{formatMonth(exp.createdAt)}</span>
                                <span className="expense-date-day">{formatDay(exp.createdAt)}</span>
                              </div>
                              <div className="expense-info">
                                <span className="expense-title">{exp.title}</span>
                                <span className="expense-payer">
                                  Paid by <strong>{exp.paidById === user?.id ? 'You' : exp.paidBy.name}</strong>
                                </span>
                              </div>
                            </div>

                            <div className="expense-right">
                              <div className="expense-amount-box">
                                <span className="amount-label">Total bill</span>
                                <span className="amount-val">${exp.totalAmount.toFixed(2)}</span>
                              </div>
                              <div className="expense-relationship">
                                {renderExpenseRelation(exp)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Column: Group balances & settlements */}
                  <div className="sidebar-summary">
                    <div className="card glass">
                      <h3 style={{ fontSize: '0.85rem', marginBottom: '8px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Your Workspace Balance
                      </h3>
                      {(() => {
                        const bal = getActiveUserBalance();
                        return (
                          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: bal > 0 ? 'var(--color-positive)' : bal < 0 ? 'var(--color-negative)' : 'inherit' }}>
                            {bal > 0 ? '+' : ''}${bal.toFixed(2)}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <div className="debt-section-header">
                        <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
                          Debts
                        </h3>
                        <div className="debt-toggle-box">
                          <button
                            className={`debt-toggle-btn ${isSimplifyDebts ? 'active' : ''}`}
                            onClick={() => setIsSimplifyDebts(true)}
                          >
                            Simplify
                          </button>
                          <button
                            className={`debt-toggle-btn ${!isSimplifyDebts ? 'active' : ''}`}
                            onClick={() => setIsSimplifyDebts(false)}
                          >
                            Direct
                          </button>
                        </div>
                      </div>

                      <div className="debts-list">
                        {(() => {
                          const targetDebts = isSimplifyDebts
                            ? groupDetails.balances.simplifiedDebts
                            : groupDetails.balances.directDebts;

                          if (targetDebts.length === 0) {
                            return (
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                                Workspace is settled! 🎉
                              </p>
                            );
                          }

                          return targetDebts.map((debt, index) => {
                            const involveUser = debt.fromUser.id === user?.id || debt.toUser.id === user?.id;
                            return (
                              <div key={index} className="debt-item">
                                <div className="debt-item-content">
                                  <strong>{debt.fromUser.id === user?.id ? 'You' : debt.fromUser.name}</strong>
                                  <span> owes </span>
                                  <strong>{debt.toUser.id === user?.id ? 'you' : debt.toUser.name}</strong>
                                  <br />
                                  <span className="debt-amount">${debt.amount.toFixed(2)}</span>
                                </div>
                                
                                {involveUser && (
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleQuickSettle(debt)}
                                  >
                                    Settle
                                  </button>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: '12px' }}>
                        Members List
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {groupDetails.group.members.map(member => {
                          const memberNet = groupDetails.balances.netBalances[member.userId] || 0;
                          return (
                            <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px', borderRadius: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <img
                                  className="avatar-sm"
                                  src={member.user.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${member.user.name}`}
                                  alt={member.user.name}
                                />
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                  {member.userId === user?.id ? 'You' : member.user.name}
                                </span>
                              </div>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                  color: memberNet > 0 ? 'var(--color-positive)' : memberNet < 0 ? 'var(--color-negative)' : 'var(--text-muted)'
                                }}>
                                  {memberNet > 0 ? '+' : ''}${memberNet.toFixed(2)}
                                </span>

                                {member.userId !== user?.id && (
                                  <button
                                    type="button"
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}
                                    onClick={() => handleRemoveMember(member.userId, member.user.name)}
                                  >
                                    &times;
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ marginTop: '12px' }}>
                      <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: '12px' }}>
                        Settlement Logs
                      </h3>
                      {groupDetails.group.settlements.length === 0 ? (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                          No payments recorded yet.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                          {groupDetails.group.settlements.map(settle => (
                            <div key={settle.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '6px', fontSize: '0.8rem' }}>
                              <div style={{ flex: 1, color: 'var(--text-secondary)' }}>
                                <strong>{settle.payerId === user?.id ? 'You' : settle.payer.name}</strong>
                                <span> paid </span>
                                <strong>{settle.receiverId === user?.id ? 'you' : settle.receiver.name}</strong>
                                <br />
                                <span style={{ color: 'var(--color-positive)', fontWeight: 700 }}>${settle.amount.toFixed(2)}</span>
                              </div>
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', color: 'var(--color-negative)', cursor: 'pointer', padding: '4px' }}
                                onClick={() => handleRevertSettlement(settle.id)}
                              >
                                🗑
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expense Details Drawer Overlay */}
                  {activeExpenseDetail && (
                    <div className="expense-detail-overlay" style={{ top: '0' }}>
                      <div className="expense-detail-content">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
                          <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{activeExpenseDetail.title}</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              Added on {formatDate(activeExpenseDetail.createdAt)}
                            </p>
                          </div>
                          <button className="btn btn-secondary btn-sm" onClick={() => setActiveExpenseDetail(null)}>
                            Back to Workspace
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '40px', margin: '16px 0' }}>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              Total Expense
                            </span>
                            <span style={{ fontSize: '2rem', fontWeight: 800 }}>
                              ${activeExpenseDetail.totalAmount.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              Paid By
                            </span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                              {activeExpenseDetail.paidById === user?.id ? 'You' : activeExpenseDetail.paidBy.name}
                            </span>
                          </div>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              Split Method
                            </span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                              {activeExpenseDetail.splitType}
                            </span>
                          </div>
                        </div>

                        <div className="card">
                          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Splits Breakdown</h3>
                          <div className="split-details-list">
                            {activeExpenseDetail.splits.map(split => (
                              <div key={split.id} className="split-detail-item">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <img
                                    className="avatar-sm"
                                    src={split.user.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${split.user.name}`}
                                    alt={split.user.name}
                                  />
                                  <span style={{ fontSize: '0.9rem' }}>
                                    {split.userId === user?.id ? 'You' : split.user.name}
                                  </span>
                                  
                                  {split.percentage !== null && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      ({split.percentage}%)
                                    </span>
                                  )}

                                  {split.shares !== null && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      ({split.shares} share{split.shares > 1 ? 's' : ''})
                                    </span>
                                  )}
                                </div>
                                <span className="split-detail-amount">${split.amount.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: 'auto' }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              setExpenseToEdit(activeExpenseDetail);
                              setIsExpenseModalOpen(true);
                            }}
                          >
                            Edit Expense
                          </button>
                          <button
                            className="btn btn-danger-outline"
                            onClick={() => handleDeleteExpense(activeExpenseDetail.id)}
                          >
                            Delete Expense
                          </button>
                        </div>
                      </div>

                      <ChatPane
                        expenseId={activeExpenseDetail.id}
                        expenseTitle={activeExpenseDetail.title}
                        onClose={() => setActiveExpenseDetail(null)}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', gridColumn: 'span 2' }}>
                  Please select a group from the switcher panel to view details.
                </div>
              )}
            </div>
          )}

          {activeTab === 'import' && (
            <div className="main-feed" style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '40px' }}>
              <div>
                <h1 className="group-title" style={{ fontSize: '2rem', marginBottom: '8px' }}>Ingest Expense CSV</h1>
                <p className="group-desc" style={{ marginBottom: '28px' }}>
                  Upload or paste your CSV data. The parser will automatically normalize names, convert currencies (e.g. USD to INR @ 83.0), correct rounding adjustments, detect duplicates, classify settlements, and log anomalies.
                </p>
              </div>

              {importError && <div className="error-banner">{importError}</div>}

              {importResult ? (
                /* Success and Anomaly Log Report */
                <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.4rem', color: 'var(--color-positive)', fontWeight: 800, marginBottom: '8px' }}>
                      🎉 Import Successful!
                    </h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Created group <strong>{importResult.groupName}</strong>.
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Rows Processed</span>
                      <strong style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>{importResult.totalRows}</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Expenses Imported</span>
                      <strong style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', color: 'var(--color-primary)' }}>{importResult.importedExpenses}</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Settlements Imported</span>
                      <strong style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', color: 'var(--color-positive)' }}>{importResult.importedSettlements}</strong>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>Anomaly Log & Resolutions Report</h3>
                    {importResult.anomalies.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        No anomalies detected. All rows were parsed cleanly.
                      </p>
                    ) : (
                      <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: '10px', background: 'rgba(0,0,0,0.1)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '12px' }}>Row</th>
                              <th style={{ padding: '12px' }}>Type</th>
                              <th style={{ padding: '12px' }}>Anomaly Description</th>
                              <th style={{ padding: '12px' }}>Resolution Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importResult.anomalies.map((a, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{a.row}</td>
                                <td style={{ padding: '10px 12px' }}>
                                  <span style={{
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    backgroundColor: a.type === 'CRITICAL' ? 'var(--color-negative-bg)' : a.type === 'WARNING' ? 'rgba(225, 140, 90, 0.15)' : 'rgba(255,255,255,0.05)',
                                    color: a.type === 'CRITICAL' ? 'var(--color-negative)' : a.type === 'WARNING' ? 'var(--color-primary)' : 'var(--text-secondary)'
                                  }}>
                                    {a.type}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{a.message}</td>
                                <td style={{ padding: '10px 12px', fontWeight: 700, color: a.action === 'SKIPPED' ? 'var(--color-negative)' : 'var(--color-positive)' }}>{a.action}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '14px', marginTop: '12px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setImportResult(null)}
                    >
                      Import Another File
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setActiveGroupId(importResult.groupId);
                        setActiveTab('groups');
                      }}
                    >
                      Go to Imported Workspace &rarr;
                    </button>
                  </div>
                </div>
              ) : (
                /* Paste Text Area Form */
                <form onSubmit={handleCSVImport} className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Paste CSV Content</label>
                    <textarea
                      className="form-input"
                      style={{
                        height: '240px',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        lineHeight: 1.5,
                        resize: 'vertical',
                        padding: '16px'
                      }}
                      placeholder="date,description,paid_by,amount,currency,split_type,split_with,split_details,notes&#10;2026-02-01,February rent,Aisha,48000,INR,equal,&quot;Aisha;Rohan;Priya;Meera&quot;,,"
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setCsvText(`date,description,paid_by,amount,currency,split_type,split_with,split_details,notes
2026-02-01,February rent,Aisha,48000,INR,equal,"Aisha;Rohan;Priya;Meera",,
2026-02-03,Groceries BigBasket,Priya,2340,INR,equal,"Aisha;Rohan;Priya;Meera",,
2026-02-05,Wifi bill Feb,Rohan,1199,INR,equal,"Aisha;Rohan;Priya;Meera",,
2026-02-08,Dinner at Marina Bites,Dev,3200,INR,equal,"Aisha;Rohan;Priya;Dev",,Dev visiting for the weekend
2026-02-08,dinner - marina bites,Dev,3200,INR,equal,"Aisha;Rohan;Priya;Dev",,
2026-02-10,Electricity Feb,Aisha,"1,200",INR,equal,"Aisha;Rohan;Priya;Meera",,
2026-02-12,Maid salary Feb,Meera,3000,INR,equal,"Aisha;Rohan;Priya;Meera",,
2026-02-14,Movie night snacks,priya,640,INR,equal,"Aisha;Rohan;Priya",,Meera skipped
2026-02-15,Cylinder refill,Rohan,899.995,INR,equal,"Aisha;Rohan;Priya;Meera",,
2026-02-18,Groceries DMart,Priya S,1875,INR,equal,"Aisha;Rohan;Priya;Meera",,
2026-02-20,Aisha birthday cake,Rohan,1500,INR,unequal,"Rohan;Priya;Meera","Rohan 700; Priya 400; Meera 400",Aisha not charged obviously
2026-02-22,House cleaning supplies,,780,INR,equal,"Aisha;Rohan;Priya;Meera",,can't remember who paid
2026-02-25,Rohan paid Aisha back,Rohan,5000,INR,,Aisha,,this is a settlement not an expense??
2026-02-28,Pizza Friday,Aisha,1440,INR,percentage,"Aisha;Rohan;Priya;Meera","Aisha 30%; Rohan 30%; Priya 30%; Meera 20%",percentages might be off
01/03/2026,March rent,Aisha,48000,INR,equal,"Aisha;Rohan;Priya;Meera",,
03/03/2026,Groceries BigBasket,Meera,2810,INR,equal,"Aisha;Rohan;Priya;Meera",,
05/03/2026,Wifi bill Mar,Rohan,1199,INR,equal,"Aisha;Rohan;Priya;Meera",,
08/03/2026,Goa flights,Aisha,32400,INR,equal,"Aisha;Rohan;Priya;Dev",,trip starts!
09/03/2026,Goa villa booking,Dev,540,USD,equal,"Aisha;Rohan;Priya;Dev",,booked on intl site
10/03/2026,Beach shack lunch,Rohan,84,USD,equal,"Aisha;Rohan;Priya;Dev",,
10/03/2026,Scooter rentals,Priya,3600,INR,share,"Aisha;Rohan;Priya;Dev","Aisha 1; Rohan 2; Priya 1; Dev 2",Rohan and Dev took the bigger ones
11/03/2026,Parasailing,Dev,150,USD,equal,"Aisha;Rohan;Priya;Dev;Dev's friend Kabir",,Kabir joined for the day
11/03/2026,Dinner at Thalassa,Aisha,2400,INR,equal,"Aisha;Rohan;Priya;Dev",,
11/03/2026,Thalassa dinner,Rohan,2450,INR,equal,"Aisha;Rohan;Priya;Dev",,Aisha also logged this I think hers is wrong
12/03/2026,Parasailing refund,Dev,-30,USD,equal,"Aisha;Rohan;Priya;Dev",,one slot got cancelled
Mar 14,Airport cab,rohan ,1100,INR,equal,"Aisha;Rohan;Priya;Dev",,
15/03/2026,Groceries DMart,Priya,2105,,equal,"Aisha;Rohan;Priya;Meera",,forgot to set currency
18/03/2026,Electricity Mar,Aisha, 1450 ,INR,equal,"Aisha;Rohan;Priya;Meera",,
20/03/2026,Maid salary Mar,Meera,3000,INR,equal,"Aisha;Rohan;Priya;Meera",,
22/03/2026,Dinner order Swiggy,Priya,0,INR,equal,"Aisha;Rohan;Priya;Meera",,counted twice earlier - fixing later
25/03/2026,Weekend brunch,Meera,2200,INR,percentage,"Aisha;Rohan;Priya;Meera","Aisha 30%; Rohan 30%; Priya 30%; Meera 20%",
28/03/2026,Meera farewell dinner,Aisha,4800,INR,equal,"Aisha;Rohan;Priya;Meera",,Meera moving out Sunday :(
04/05/2026,Deep cleaning service,Rohan,2500,INR,equal,"Aisha;Rohan;Priya",,is this April 5 or May 4? format is a mess
2026-04-01,April rent,Aisha,48000,INR,share,"Aisha;Rohan;Priya","Aisha 2; Rohan 1; Priya 1",Aisha took Meera's room too
2026-04-02,Groceries BigBasket,Priya,2640,INR,equal,"Aisha;Rohan;Priya;Meera",,oops Meera still in the group list
2026-04-05,Wifi bill Apr,Rohan,1199,INR,equal,"Aisha;Rohan;Priya",,
2026-04-08,Sam deposit share,Sam,15000,INR,equal,Aisha,,Sam moving in! paid Aisha his deposit
2026-04-10,Housewarming drinks,Sam,3100,INR,equal,"Aisha;Rohan;Priya;Sam",,
2026-04-12,Electricity Apr,Aisha,1380,INR,equal,"Aisha;Rohan;Priya;Sam",,
2026-04-15,Groceries DMart,Sam,1990,INR,equal,"Aisha;Rohan;Priya;Sam",,
2026-04-18,Furniture for common room,Aisha,12000,INR,equal,"Aisha;Rohan;Priya;Sam","Aisha 1; Rohan 1; Priya 1; Sam 1",split_type says equal but someone added shares anyway
2026-04-20,Maid salary Apr,Priya,3000,INR,equal,"Aisha;Rohan;Priya;Sam",,`);
                      }}
                    >
                      📄 Load Demo CSV Data
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={importLoading}
                    >
                      {importLoading ? 'Processing...' : 'Ingest & Import CSV'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

        </main>
      </div>

      {/* ================= MODALS ================= */}
      
      {/* A. CREATE GROUP MODAL */}
      {isGroupModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container glass">
            <div className="modal-header">
              <h2 className="modal-title">Create Group</h2>
              <button className="modal-close" onClick={() => setIsGroupModalOpen(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleCreateGroupSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="group-name">Group Name</label>
                  <input
                    id="group-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Summer Vacation, Flatmates"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="group-desc">Description (Optional)</label>
                  <input
                    id="group-desc"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Bills and expenses for the apartment"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Add Members</label>
                  <div className="user-select-list">
                    {allUsers.filter(u => u.id !== user?.id).map(u => (
                      <label key={u.id} className="user-select-row checkbox-label">
                        <span style={{ fontSize: '0.85rem' }}>{u.name} ({u.email})</span>
                        <input
                          type="checkbox"
                          className="checkbox-input"
                          checked={newGroupMembers.includes(u.id)}
                          onChange={() => {
                            setNewGroupMembers(prev =>
                              prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                            );
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsGroupModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* B. ADD MEMBERS MODAL */}
      {isMemberModalOpen && activeGroupId && (
        <div className="modal-overlay">
          <div className="modal-container glass">
            <div className="modal-header">
              <h2 className="modal-title">Add Group Members</h2>
              <button className="modal-close" onClick={() => {
                setIsMemberModalOpen(false);
                setInviteError('');
                setInviteName('');
                setInviteEmail('');
              }}>&times;</button>
            </div>
            
            <div className="modal-body">
              {/* Part 1: Select existing users */}
              <form onSubmit={handleAddMembersSubmit} style={{ marginBottom: '24px', borderBottom: '1px dashed var(--border-light)', paddingBottom: '20px' }}>
                <div className="form-group">
                  <label className="form-label">Select Registered Users</label>
                  <div className="user-select-list" style={{ minHeight: '100px' }}>
                    {allUsers.filter(u => !groupDetails?.group.members.some(m => m.userId === u.id)).length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', margin: 'auto', display: 'flex', alignItems: 'center', height: '100%' }}>
                        No other registered users in the database
                      </p>
                    ) : (
                      allUsers
                        .filter(u => !groupDetails?.group.members.some(m => m.userId === u.id))
                        .map(u => (
                          <label key={u.id} className="user-select-row checkbox-label">
                            <span style={{ fontSize: '0.85rem' }}>{u.name} ({u.email})</span>
                            <input
                              type="checkbox"
                              className="checkbox-input"
                              checked={addMemberIds.includes(u.id)}
                              onChange={() => {
                                setAddMemberIds(prev =>
                                  prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                                );
                              }}
                            />
                          </label>
                        ))
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={addMemberIds.length === 0}>
                    Add Selected
                  </button>
                </div>
              </form>

              {/* Part 2: Invite by email & name */}
              <form onSubmit={handleInviteSubmit}>
                <label className="form-label">Invite New Member by Name & Email</label>
                {inviteError && <div className="error-banner" style={{ padding: '6px', fontSize: '0.8rem', margin: '0 0 12px 0' }}>{inviteError}</div>}
                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Name"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="Email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-secondary btn-sm" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                    Invite & Add
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* C. EXPENSE CREATION/EDITION MODAL */}
      {activeGroupId && groupDetails && (
        <ExpenseModal
          isOpen={isExpenseModalOpen}
          onClose={() => {
            setIsExpenseModalOpen(false);
            setExpenseToEdit(null);
          }}
          groupId={activeGroupId}
          groupMembers={groupDetails.group.members.map(m => m.user)}
          onSuccess={() => fetchGroupDetails(activeGroupId)}
          expenseToEdit={expenseToEdit}
        />
      )}

      {/* D. RECORD PAYMENT / SETTLEMENT MODAL */}
      {activeGroupId && groupDetails && (
        <SettleModal
          isOpen={isSettleModalOpen}
          onClose={() => {
            setIsSettleModalOpen(false);
            setSettlePayerId('');
            setSettleReceiverId('');
            setSettleAmount(0);
          }}
          groupId={activeGroupId}
          groupMembers={groupDetails.group.members.map(m => m.user)}
          onSuccess={() => fetchGroupDetails(activeGroupId)}
          initialPayerId={settlePayerId}
          initialReceiverId={settleReceiverId}
          initialAmount={settleAmount}
        />
      )}
    </div>
  );
};

export default Dashboard;
