interface HeaderProps {
  currentView: 'list' | 'create' | 'edit' | 'settings';
  onBack: () => void;
  onNew: () => void;
  onSettings: () => void;
  onCollectAll?: () => void;
  isCollectingAll?: boolean;
  collectProgress?: { current: number; total: number };
}

export default function Header({
  currentView,
  onBack,
  onNew,
  onSettings,
  onCollectAll,
  isCollectingAll = false,
  collectProgress
}: HeaderProps) {
  return (
    <header className="bg-gradient-to-r from-red-600 to-red-700 px-4 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        {currentView !== 'list' && (
          <button
            onClick={onBack}
            className="p-2 hover:bg-red-800 rounded-lg transition-colors"
            aria-label="뒤로가기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <h1 className="text-xl font-bold flex items-center gap-2">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
          MyTube Manager
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {currentView === 'list' && (
          <>
            {/* 전체수집 버튼 */}
            <button
              onClick={onCollectAll}
              disabled={isCollectingAll}
              className={`px-3 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 text-sm ${isCollectingAll
                  ? 'bg-red-800 cursor-not-allowed'
                  : 'bg-red-800 hover:bg-red-900'
                }`}
              aria-label="전체수집"
            >
              {isCollectingAll ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {collectProgress ? (
                    <span>{collectProgress.current}/{collectProgress.total}</span>
                  ) : (
                    <span>수집 중...</span>
                  )}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  전체수집
                </>
              )}
            </button>
            <button
              onClick={onSettings}
              className="p-2 hover:bg-red-800 rounded-lg transition-colors"
              aria-label="설정"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={onNew}
              className="px-4 py-2 bg-white text-red-600 rounded-lg hover:bg-gray-100 transition-colors font-semibold flex items-center gap-2 shadow-md"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              새 그룹
            </button>
          </>
        )}
      </div>
    </header>
  );
}

