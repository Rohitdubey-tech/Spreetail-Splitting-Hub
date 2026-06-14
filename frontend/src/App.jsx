import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';

const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login('demo@example.com', 'password123');
    } catch (err) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card glass">
        <div className="auth-header">
          <div className="logo-icon" style={{ margin: '0 auto 16px auto', width: '48px', height: '48px', fontSize: '1.6rem' }}>S</div>
          <h1 className="auth-title">{isLogin ? 'Welcome Back' : 'Get Started'}</h1>
          <p className="auth-subtitle">
            {isLogin ? 'Manage splits and settle debts effortlessly' : 'Create an account to start sharing expenses'}
          </p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label className="form-label" htmlFor="reg-name">Full Name</label>
              <input
                id="reg-name"
                type="text"
                className="form-input"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              className="form-input"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="auth-pass">Password</label>
            <input
              id="auth-pass"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }} disabled={loading}>
            {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', color: 'var(--text-muted)' }}>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border-light)' }} />
          <span style={{ padding: '0 10px', fontSize: '0.8rem' }}>OR</span>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border-light)' }} />
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--color-positive)', color: 'var(--color-positive)' }}
          onClick={handleDemoLogin}
          disabled={loading}
        >
          🚀 Try Demo Account (Instant Login)
        </button>

        <div className="auth-footer">
          <span>{isLogin ? "Don't have an account? " : "Already have an account? "}</span>
          <button
            type="button"
            className="auth-link"
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
          >
            {isLogin ? 'Create one' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AppContent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)' }}>
        <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Loading Spreetail Splitting Hub...</p>
      </div>
    );
  }

  return user ? <Dashboard /> : <AuthScreen />;
};

const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
