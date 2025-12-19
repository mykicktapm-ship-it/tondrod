import { useEffect } from 'react';
import { parseInitData } from '@/lib/telegram';

export default function TelegramGate({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData) {
      const initData = (window as any).Telegram.WebApp.initData;
      parseInitData(initData);
      // additional logic to authenticate can be added here
    }
  }, []);
  return <>{children}</>;
}