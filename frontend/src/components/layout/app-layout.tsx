"use client";

import React from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { ToastProvider } from "@/components/ui/toast";

interface AppLayoutProps {
  children: React.ReactNode;
  breadcrumb?: string;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, breadcrumb }) => {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#FFF5E9] flex">
      {/* Fixed Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-200">
          {children}
        </main>
      </div>
    </div>
    </ToastProvider>
  );
};
