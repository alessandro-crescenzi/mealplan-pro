'use client';
import React, { createContext, useContext, useState, ReactNode } from 'react';

type HeaderActionsContextType = {
  setActions: (actions: ReactNode) => void;
};

const HeaderContext = createContext<HeaderActionsContextType | undefined>(undefined);
const HeaderContentContext = createContext<ReactNode>(null);

export const useHeaderActions = () => {
  const ctx = useContext(HeaderContext);
  if (!ctx) throw new Error("useHeaderActions deve essere usato dentro <HeaderProvider>");
  return ctx.setActions;
};

export const HeaderProvider = ({ children }: { children: ReactNode }) => {
  const [actions, setActions] = useState<ReactNode>(null);

  return (
    <HeaderContext.Provider value={{ setActions }}>
      <HeaderContentContext.Provider value={actions}>
        {children}
      </HeaderContentContext.Provider>
    </HeaderContext.Provider>
  );
};

export const HeaderActions = () => {
  const actions = useContext(HeaderContentContext);
  return <>{actions}</>;
};