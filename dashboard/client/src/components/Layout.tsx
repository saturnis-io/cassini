import React from 'react';
import { Wifi, WifiOff, Settings, RefreshCw } from 'lucide-react';
import { useDashboardStore } from '../store/dashboardStore';

interface LayoutProps {
  children: React.ReactNode;
  onReconnect: () => void;
}

export function Layout({ children, onReconnect }: LayoutProps) {
  const { connected, projectPath } = useDashboardStore();

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gradient">
                CVC Dashboard
              </h1>
              {projectPath && (
                <span className="text-sm text-gray-400 hidden sm:block">
                  {projectPath}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Connection Status */}
              <div className="flex items-center gap-2">
                {connected ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-500 hidden sm:inline">
                      Connected
                    </span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-500 hidden sm:inline">
                      Disconnected
                    </span>
                    <button
                      onClick={onReconnect}
                      className="p-1 hover:bg-gray-700 rounded"
                      title="Reconnect"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Settings */}
              <button
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1920px] mx-auto p-4">
        {children}
      </main>
    </div>
  );
}
