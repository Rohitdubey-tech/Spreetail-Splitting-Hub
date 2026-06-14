import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const round2 = (num) => Math.round(num * 100) / 100;

export const ExpenseModal = ({
  isOpen,
  onClose,
  groupId,
  groupMembers,
  onSuccess,
  expenseToEdit
}) => {
  const { user, apiBaseUrl } = useAuth();
  const [title, setTitle] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [paidById, setPaidById] = useState('');
  const [splitType, setSplitType] = useState('EQUAL');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedMembers, setSelectedMembers] = useState([]);
  
  const [customAmounts, setCustomAmounts] = useState({});
  const [customPercentages, setCustomPercentages] = useState({});
  const [customShares, setCustomShares] = useState({});

  useEffect(() => {
    if (isOpen) {
      setError('');
      if (expenseToEdit) {
        setTitle(expenseToEdit.title);
        setTotalAmount(expenseToEdit.totalAmount);
        setPaidById(expenseToEdit.paidById);
        setSplitType(expenseToEdit.splitType);
        
        const participants = expenseToEdit.splits.map(s => s.userId);
        setSelectedMembers(participants);

        const amtObj = {};
        const pctObj = {};
        const shObj = {};
        
        expenseToEdit.splits.forEach(s => {
          if (s.amount) amtObj[s.userId] = s.amount;
          if (s.percentage !== undefined && s.percentage !== null) pctObj[s.userId] = s.percentage;
          if (s.shares !== undefined && s.shares !== null) shObj[s.userId] = s.shares;
        });

        setCustomAmounts(amtObj);
        setCustomPercentages(pctObj);
        setCustomShares(shObj);
      } else {
        setTitle('');
        setTotalAmount('');
        setPaidById(user?.id || '');
        setSplitType('EQUAL');
        setSelectedMembers(groupMembers.map(m => m.id));
        setCustomAmounts({});
        setCustomPercentages({});
        setCustomShares({});
      }
    }
  }, [isOpen, expenseToEdit, groupMembers, user]);

  if (!isOpen) return null;

  const toggleMember = (userId) => {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleCustomValChange = (userId, val, type) => {
    const num = val === '' ? 0 : parseFloat(val);
    if (type === 'amount') {
      setCustomAmounts(prev => ({ ...prev, [userId]: num }));
    } else if (type === 'percentage') {
      setCustomPercentages(prev => ({ ...prev, [userId]: num }));
    } else {
      setCustomShares(prev => ({ ...prev, [userId]: num }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const amt = parseFloat(String(totalAmount));
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }

    if (selectedMembers.length === 0) {
      setError('Please select at least one member to split with');
      return;
    }

    if (splitType === 'UNEQUAL') {
      const sum = selectedMembers.reduce((acc, id) => acc + (customAmounts[id] || 0), 0);
      if (Math.abs(sum - amt) > 0.02) {
        setError(`Sum of split amounts ($${sum.toFixed(2)}) must equal total expense ($${amt.toFixed(2)})`);
        return;
      }
    } else if (splitType === 'PERCENTAGE') {
      const sum = selectedMembers.reduce((acc, id) => acc + (customPercentages[id] || 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        setError(`Sum of percentages (${sum}%) must equal exactly 100%`);
        return;
      }
    }

    setLoading(true);

    const formattedSplits = selectedMembers.map(userId => {
      const split = { userId };
      if (splitType === 'UNEQUAL') {
        split.amount = customAmounts[userId] || 0;
      } else if (splitType === 'PERCENTAGE') {
        split.percentage = customPercentages[userId] || 0;
      } else if (splitType === 'SHARE') {
        split.shares = customShares[userId] || 1;
      }
      return split;
    });

    const body = {
      groupId,
      title,
      totalAmount: amt,
      paidById,
      splitType,
      splits: formattedSplits
    };

    try {
      if (expenseToEdit) {
        await axios.put(`${apiBaseUrl}/expenses/${expenseToEdit.id}`, body);
      } else {
        await axios.post(`${apiBaseUrl}/expenses`, body);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container glass">
        <div className="modal-header">
          <h2 className="modal-title">{expenseToEdit ? 'Edit Expense' : 'Add Expense'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="exp-desc">Description</label>
              <input
                id="exp-desc"
                type="text"
                className="form-input"
                placeholder="e.g. Flight tickets, Dinner, Groceries"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label" htmlFor="exp-amt">Total Amount ($)</label>
                <input
                  id="exp-amt"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  placeholder="0.00"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  required
                />
              </div>

              <div>
                <label className="form-label" htmlFor="exp-payer">Paid By</label>
                <select
                  id="exp-payer"
                  className="form-select"
                  value={paidById}
                  onChange={(e) => setPaidById(e.target.value)}
                  required
                >
                  {groupMembers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.id === user?.id ? 'You' : m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Splitting Mode</label>
              <div className="split-type-tabs">
                {['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE'].map(type => (
                  <button
                    key={type}
                    type="button"
                    className={`split-tab-btn ${splitType === type ? 'active' : ''}`}
                    onClick={() => setSplitType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="split-selector-box">
              <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '12px' }}>
                Split between:
              </label>

              <div className="split-members-list">
                {groupMembers.map(member => {
                  const isChecked = selectedMembers.includes(member.id);
                  return (
                    <div key={member.id} className="split-member-row">
                      <label className="checkbox-label" style={{ flex: 1 }}>
                        <input
                          type="checkbox"
                          className="checkbox-input"
                          checked={isChecked}
                          onChange={() => toggleMember(member.id)}
                        />
                        <span style={{ color: isChecked ? 'var(--text-main)' : 'var(--text-secondary)' }}>
                          {member.id === user?.id ? 'You' : member.name}
                        </span>
                      </label>

                      {isChecked && splitType !== 'EQUAL' && (
                        <div className="split-member-input-wrapper">
                          {splitType === 'UNEQUAL' && (
                            <>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>$</span>
                              <input
                                type="number"
                                step="0.01"
                                className="form-input split-input-small"
                                placeholder="0.00"
                                value={customAmounts[member.id] || ''}
                                onChange={(e) => handleCustomValChange(member.id, e.target.value, 'amount')}
                                required
                              />
                            </>
                          )}

                          {splitType === 'PERCENTAGE' && (
                            <>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                className="form-input split-input-small"
                                placeholder="0"
                                value={customPercentages[member.id] || ''}
                                onChange={(e) => handleCustomValChange(member.id, e.target.value, 'percentage')}
                                required
                              />
                              <span className="split-input-unit">%</span>
                            </>
                          )}

                          {splitType === 'SHARE' && (
                            <>
                              <input
                                type="number"
                                step="1"
                                min="1"
                                className="form-input split-input-small"
                                placeholder="1"
                                value={customShares[member.id] || ''}
                                onChange={(e) => handleCustomValChange(member.id, e.target.value, 'shares')}
                                required
                              />
                              <span className="split-input-unit" style={{ width: '40px' }}>share(s)</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : expenseToEdit ? 'Save Changes' : 'Create Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseModal;
