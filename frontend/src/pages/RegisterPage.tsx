import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const pushToast = useUiStore((s) => s.pushToast);
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: () => authApi.register(name, email, password),
    onSuccess: ({ user, accessToken }) => {
      setAuth(user, accessToken);
      pushToast('success', `Account created. Welcome, ${user.name}!`);
      navigate('/products');
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Create account</h1>
        <p className="page-subtitle">Start shopping in under a minute.</p>

        <form className="form" onSubmit={onSubmit}>
          <div className="form-field">
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          </div>

          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <span className="hint">
              At least 8 characters with a letter and a number.
            </span>
          </div>

          <button
            className="btn btn--primary btn--block"
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 14 }}>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
