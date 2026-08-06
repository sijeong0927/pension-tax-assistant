/**
 * config.ts
 * 프론트엔드 공통 설정 및 API BASE URL 관리
 */

export const getApiBaseUrl = (): string => {
  const rawUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'https://tax-i-ef90.onrender.com';
  
  return rawUrl.trim().replace(/\/+$/, '');
};

export const API_BASE_URL = getApiBaseUrl();
