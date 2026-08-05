'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/';
  
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const endpoint = isLogin ? '/api/v1/auth/login' : '/api/v1/auth/signup';
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      let res;
      if (isLogin) {
        // OAuth2PasswordRequestForm expects form-encoded data
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        
        res = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString()
        });
      } else {
        res = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, email, password })
        });
      }
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || '인증에 실패했습니다.');
      }
      
      const data = await res.json();
      setAuthToken(data.access_token);
      router.push(redirectUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8" style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.06)' }}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ background: 'rgba(53,37,205,0.1)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '24px', color: 'var(--color-primary)' }}>
              lock
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--color-on-surface)' }}>
            {isLogin ? '로그인' : '회원가입'}
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--color-on-surface-variant)' }}>
            절세 택시의 모든 기능을 이용해보세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--color-on-surface)' }}>
                이름
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
                className="w-full px-4 py-3 rounded-xl text-sm"
                style={{
                  border: '1px solid rgba(199,196,216,0.4)',
                  background: 'var(--color-surface)',
                  outline: 'none'
                }}
                placeholder="홍길동"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--color-on-surface)' }}>
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{
                border: '1px solid rgba(199,196,216,0.4)',
                background: 'var(--color-surface)',
                outline: 'none'
              }}
              placeholder="example@tax.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--color-on-surface)' }}>
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{
                border: '1px solid rgba(199,196,216,0.4)',
                background: 'var(--color-surface)',
                outline: 'none'
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-semibold text-sm mt-2 transition-opacity"
            style={{
              background: 'var(--color-primary)',
              color: 'white',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? '처리 중...' : (isLogin ? '로그인' : '회원가입')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-sm font-semibold"
            style={{ color: 'var(--color-primary)' }}
          >
            {isLogin ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </div>
      </div>
    </div>
  );
}
