import React, { useState } from 'react';
import {
  Users,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  ExternalLink,
  ShieldAlert,
  Send,
  Layers,
  ListPlus,
  RefreshCw,
  LayoutList,
  LayoutGrid,
  Globe,
  Radio,
  Sparkles,
} from 'lucide-react';
import { TargetGroup } from '../types';

interface TargetGroupsCardProps {
  groups: TargetGroup[];
  onAddGroup: (title: string, usernameOrLink: string, category?: string) => Promise<void>;
  onAddBulkGroups: (bulkText: string, category?: string) => Promise<number>;
  onToggleGroup: (id: string, isActive: boolean) => Promise<void>;
  onToggleAllGroups: (isActive: boolean) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onDeletePostedGroups?: () => Promise<void>;
  onDeleteBulkGroupsByIds?: (ids: string[]) => Promise<void>;
  onTestSendTarget?: (target: string) => Promise<void>;
  onSyncGroups?: () => Promise<void>;
}

export const TargetGroupsCard: React.FC<TargetGroupsCardProps> = ({
  groups,
  onAddGroup,
  onAddBulkGroups,
  onToggleGroup,
  onToggleAllGroups,
  onDeleteGroup,
  onDeletePostedGroups,
  onDeleteBulkGroupsByIds,
  onTestSendTarget,
  onSyncGroups,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPostedModal, setShowPostedModal] = useState(false);
  const [postedSearch, setPostedSearch] = useState('');
  const [selectedPostedIds, setSelectedPostedIds] = useState<string[]>([]);
  const [isDeletingPosted, setIsDeletingPosted] = useState(false);

  const [addMode, setAddMode] = useState<'bulk' | 'single'>('bulk');
  const [newTitle, setNewTitle] = useState('');
  const [newLink, setNewLink] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [newCategory, setNewCategory] = useState('عمومی');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('همه');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testingTarget, setTestingTarget] = useState<string | null>(null);

  const postedGroups = groups.filter(
    (g) => g.lastPostedAt && (!g.errorMessage || g.errorMessage.trim() === '')
  );

  const filteredPostedGroups = postedGroups.filter(
    (g) =>
      g.title.toLowerCase().includes(postedSearch.toLowerCase()) ||
      g.usernameOrLink.toLowerCase().includes(postedSearch.toLowerCase())
  );

  const handleDeleteAllPosted = async () => {
    if (!onDeletePostedGroups) return;
    if (postedGroups.length === 0) return;
    if (!window.confirm(`آیا از حذف تمامی ${postedGroups.length} گروه که پیام در آن‌ها با موفقیت ۱۰۰٪ ارسال شده است، اطمینان دارید؟`)) {
      return;
    }

    setIsDeletingPosted(true);
    try {
      await onDeletePostedGroups();
      setShowPostedModal(false);
      setSelectedPostedIds([]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeletingPosted(false);
    }
  };

  const handleDeleteSelectedPosted = async () => {
    if (!onDeleteBulkGroupsByIds || selectedPostedIds.length === 0) return;
    if (!window.confirm(`آیا از حذف ${selectedPostedIds.length} گروه انتخاب‌شده اطمینان دارید؟`)) return;

    setIsDeletingPosted(true);
    try {
      await onDeleteBulkGroupsByIds(selectedPostedIds);
      setSelectedPostedIds([]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeletingPosted(false);
    }
  };

  const handleSync = async () => {
    if (!onSyncGroups || isSyncing) return;
    setIsSyncing(true);
    try {
      await onSyncGroups();
    } finally {
      setIsSyncing(false);
    }
  };

  const categories = ['همه', ...Array.from(new Set(groups.map((g) => g.category || 'عمومی')))];

  const filteredGroups = groups.filter((g) => {
    const matchesSearch =
      g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.usernameOrLink.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'همه' || g.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSingleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLink.trim()) return;

    setLoading(true);
    try {
      await onAddGroup(newTitle.trim() || newLink.trim(), newLink.trim(), newCategory);
      setNewTitle('');
      setNewLink('');
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInput.trim()) return;

    setLoading(true);
    try {
      await onAddBulkGroups(bulkInput, newCategory);
      setBulkInput('');
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSingleTest = async (target: string) => {
    if (!onTestSendTarget) return;
    setTestingTarget(target);
    try {
      await onTestSendTarget(target);
    } finally {
      setTestingTarget(null);
    }
  };

  const getTelegramUrl = (raw: string) => {
    let clean = raw.trim();
    if (clean.startsWith('http')) return clean;
    if (clean.startsWith('t.me/')) return 'https://' + clean;
    if (clean.startsWith('@')) return `https://t.me/${clean.substring(1)}`;
    return `https://t.me/${clean}`;
  };

  const detectedBulkCount = bulkInput
    .split(/[\s,\n\r;]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  const activeCount = groups.filter((g) => g.isActive).length;

  return (
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 text-slate-100 shadow-xl backdrop-blur-md flex flex-col">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base text-white">گروه‌های هدف تبلیغ</h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">
                {activeCount} از {groups.length} فعال
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              مدیریت و همگام‌سازی گروه‌های تلگرام جهت ارسال هوشمند تبلیغات
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
          <button
            onClick={() => {
              setSelectedPostedIds([]);
              setShowPostedModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-medium text-xs border border-emerald-500/30 transition-all active:scale-95 shadow-sm"
            title="مشاهده لیست گروه‌هایی که پیام تبلیغات به‌صورت قطعی و ۱۰۰٪ موفق در آن‌ها ارسال شده است"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>ارسال‌شده‌های موفق</span>
            <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-emerald-500 text-slate-950 font-mono">
              {postedGroups.length}
            </span>
          </button>

          {onSyncGroups && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-sky-400 font-medium text-xs border border-slate-700 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
              title="همگام‌سازی اتوماتیک لیست گروه‌های تلگرام با برنامه"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'در حال همگام‌سازی...' : 'همگام‌سازی تلگرام'}</span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md shadow-sky-500/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن گروه</span>
          </button>
        </div>
      </div>

      {/* Filter, Search & View Controls Bar */}
      <div className="py-3 flex flex-col sm:flex-row items-center justify-between gap-2.5">
        
        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="جستجوی نام یا آیدی گروه..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl pr-9 pl-8 py-1.5 text-xs text-white focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Pills & Layout View Toggle */}
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto overflow-x-auto">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs py-0.5">
            {categories.map((cat) => {
              const count = cat === 'همه' ? groups.length : groups.filter((g) => g.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap text-[11px] font-medium flex items-center gap-1 ${
                    selectedCategory === cat
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  <span>{cat}</span>
                  <span className="text-[10px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          {/* View Toggle */}
          <div className="flex items-center p-0.5 bg-slate-950 rounded-lg border border-slate-800 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'list' ? 'bg-sky-500/20 text-sky-400 font-bold' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="نمای لیستی"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'grid' ? 'bg-sky-500/20 text-sky-400 font-bold' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="نمای کارت‌بندی"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* Select All / Deselect Toolbar */}
      <div className="flex items-center justify-between bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800/80 mb-3 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleAllGroups(true)}
            className="px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            title="فعال‌سازی تمامی گروه‌ها"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>انتخاب همه ({groups.length})</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleAllGroups(false)}
            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 flex items-center gap-1 text-xs font-medium transition-colors"
            title="لغو انتخاب تمامی گروه‌ها"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>غیرفعال‌سازی همه</span>
          </button>
        </div>

        <span className="text-[11px] text-slate-400 font-medium">
          نمایش <span className="text-sky-400 font-bold">{filteredGroups.length}</span> گروه
        </span>
      </div>

      {/* Groups Container */}
      {filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-slate-800 rounded-xl p-4 text-center bg-slate-950/40 my-1">
          <Users className="w-8 h-8 text-slate-600 mb-2" />
          <p className="text-xs text-slate-400 font-medium">هیچ گروهی با این مشخصات یافت نشد.</p>
          <p className="text-[11px] text-slate-500 mt-1">
            با دکمه «همگام‌سازی تلگرام» یا «افزودن گروه» می‌توانید گروه‌ها را اضافه فرمایید.
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="space-y-2 overflow-y-auto max-h-[420px] pr-1 my-1">
          {filteredGroups.map((group) => {
            const cleanTitle = group.title || 'گروه تلگرام';
            const initialLetter = cleanTitle.trim().charAt(0).toUpperCase();

            return (
              <div
                key={group.id}
                className={`group p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                  group.isActive
                    ? 'bg-slate-950/90 border-slate-800 hover:border-slate-700/90 hover:bg-slate-950 shadow-sm'
                    : 'bg-slate-950/30 border-slate-800/40 opacity-50'
                }`}
              >
                {/* Left side: Checkbox + Avatar + Title & Meta */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={group.isActive}
                    onChange={(e) => onToggleGroup(group.id, e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-500 accent-sky-500 cursor-pointer flex-shrink-0"
                  />

                  {/* Group Avatar */}
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                    {initialLetter}
                  </div>

                  {/* Text Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-xs text-white truncate max-w-[200px] sm:max-w-[280px]" title={cleanTitle}>
                        {cleanTitle}
                      </h4>
                      {group.category && (
                        <span className="text-[10px] bg-slate-800/80 text-slate-300 border border-slate-700/60 px-2 py-0.5 rounded-full font-medium shrink-0 max-w-[110px] truncate">
                          {group.category}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-sans">
                      <span className="dir-ltr text-sky-400 font-mono font-medium truncate max-w-[160px]">
                        {group.usernameOrLink}
                      </span>
                      {group.memberCount && (
                        <span>• {group.memberCount.toLocaleString('fa-IR')} عضو</span>
                      )}
                      {group.lastPostedAt && (
                        <span className="text-slate-500">
                          • {new Date(group.lastPostedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    {group.errorMessage && (
                      <div className="mt-1 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md flex items-center gap-1.5">
                        <ShieldAlert className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{group.errorMessage}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Test Send */}
                  {onTestSendTarget && (
                    <button
                      type="button"
                      onClick={() => handleSingleTest(group.usernameOrLink)}
                      disabled={testingTarget === group.usernameOrLink}
                      className="px-2 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                      title={`ارسال پیام تست به ${group.usernameOrLink}`}
                    >
                      <Send className={`w-3 h-3 ${testingTarget === group.usernameOrLink ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{testingTarget === group.usernameOrLink ? '...' : 'تست'}</span>
                    </button>
                  )}

                  {/* Telegram External Link */}
                  <a
                    href={getTelegramUrl(group.usernameOrLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-sky-300 transition-colors"
                    title="باز کردن در تلگرام"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  {/* Delete Button */}
                  <button
                    onClick={() => onDeleteGroup(group.id)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                    title="حذف گروه"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* GRID / CARDS VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto max-h-[420px] pr-1 my-1">
          {filteredGroups.map((group) => {
            const cleanTitle = group.title || 'گروه تلگرام';
            const initialLetter = cleanTitle.trim().charAt(0).toUpperCase();

            return (
              <div
                key={group.id}
                className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                  group.isActive
                    ? 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                    : 'bg-slate-950/30 border-slate-800/40 opacity-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={group.isActive}
                      onChange={(e) => onToggleGroup(group.id, e.target.checked)}
                      className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-500 accent-sky-500 cursor-pointer flex-shrink-0"
                    />
                    <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                      {initialLetter}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-white truncate" title={cleanTitle}>
                        {cleanTitle}
                      </h4>
                      <p className="dir-ltr text-[11px] text-sky-400 font-mono truncate">
                        {group.usernameOrLink}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => onDeleteGroup(group.id)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
                  <span className="bg-slate-900 px-2 py-0.5 rounded text-slate-300 border border-slate-800 truncate max-w-[100px]">
                    {group.category || 'عمومی'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {onTestSendTarget && (
                      <button
                        onClick={() => handleSingleTest(group.usernameOrLink)}
                        disabled={testingTarget === group.usernameOrLink}
                        className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20"
                      >
                        تست
                      </button>
                    )}
                    <a
                      href={getTelegramUrl(group.usernameOrLink)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded bg-slate-900 text-slate-400 hover:text-white"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Group Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 text-white shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-400" />
                افزودن گروه تلگرامی جدید
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {/* Mode Selector Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAddMode('bulk')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                  addMode === 'bulk'
                    ? 'bg-sky-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ListPlus className="w-4 h-4" />
                <span>افزودن دسته جمعی (چندین آیدی)</span>
              </button>

              <button
                type="button"
                onClick={() => setAddMode('single')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                  addMode === 'single'
                    ? 'bg-sky-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>افزودن تکی</span>
              </button>
            </div>

            {/* Bulk Add Form */}
            {addMode === 'bulk' && (
              <form onSubmit={handleBulkAddSubmit} className="space-y-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-300 font-medium block">
                      آیدی یا لینک گروه‌ها (بین هر کدام یک فاصله، اینتر یا کاما بگذارید):
                    </label>
                    {detectedBulkCount > 0 && (
                      <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        {detectedBulkCount} آیدی تشخیص داده شد
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={5}
                    placeholder={`مثال:\n@niyaz_dargaz @karyabi_group @my_group3\nt.me/group_four`}
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-sky-500 dir-ltr text-left font-mono leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    💡 می‌توانید ده‌ها آیدی گروه مانند <code className="text-sky-300">@niyaz_dargaz @karyabi_group</code> را یکجا کپی و اینجا پیست کنید.
                  </p>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium mb-1 block">
                    دسته‌بندی برای این گروه ها:
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: عمومی، نیازمندی، بازارچه"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    disabled={loading || detectedBulkCount === 0}
                    className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md shadow-sky-500/20 disabled:opacity-50"
                  >
                    {loading ? 'در حال ثبت دسته جمعی...' : `افزودن دسته جمعی (${detectedBulkCount} گروه)`}
                  </button>
                </div>
              </form>
            )}

            {/* Single Add Form */}
            {addMode === 'single' && (
              <form onSubmit={handleSingleAddSubmit} className="space-y-3.5">
                <div>
                  <label className="text-xs text-slate-300 font-medium mb-1 block">
                    نام / عنوان گروه (جهت شناسایی):
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: گروه بورس و خرید پوشاک"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium mb-1 block">
                    آیدی یا لینک گروه تلگرام:
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: @my_group_id یا t.me/joinchat/..."
                    value={newLink}
                    onChange={(e) => setNewLink(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 dir-ltr text-left font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium mb-1 block">
                    دسته‌بندی گروه:
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: عمومی، پوشاک، دیجیتال، بازارچه"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md shadow-sky-500/20"
                  >
                    {loading ? 'در حال ثبت...' : 'افزودن گروه'}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Successfully Posted Groups Modal */}
      {showPostedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    گروه‌های با ارسال ۱۰۰٪ موفق و قطعی
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {postedGroups.length} گروه
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    لیست گروه‌هایی که پیام تبلیغاتی بدون هیچ‌گونه خطا در آن‌ها منتشر شده است
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowPostedModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Actions Bar & Search */}
            <div className="p-4 bg-slate-950/40 border-b border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="جستجو در ارسال‌شده‌ها..."
                  value={postedSearch}
                  onChange={(e) => setPostedSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white focus:outline-none transition-colors"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                {selectedPostedIds.length > 0 && onDeleteBulkGroupsByIds && (
                  <button
                    onClick={handleDeleteSelectedPosted}
                    disabled={isDeletingPosted}
                    className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>حذف انتخاب‌شده‌ها ({selectedPostedIds.length})</span>
                  </button>
                )}

                {onDeletePostedGroups && (
                  <button
                    onClick={handleDeleteAllPosted}
                    disabled={isDeletingPosted || postedGroups.length === 0}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف تمامی {postedGroups.length} گروه با ۱ کلیک</span>
                  </button>
                )}
              </div>
            </div>

            {/* Modal Group List */}
            <div className="p-4 overflow-y-auto max-h-[50vh] space-y-2">
              {filteredPostedGroups.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-medium">هیچ گروه ارسال‌شده موفقی یافت نشد.</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    پس از اجرای ربات و ارسال موفق به گروه‌ها، اسامی آن‌ها در این لیست قرار خواهد گرفت.
                  </p>
                </div>
              ) : (
                filteredPostedGroups.map((group) => {
                  const isSelected = selectedPostedIds.includes(group.id);
                  const postedDateStr = group.lastPostedAt
                    ? new Date(group.lastPostedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) +
                      ' - ' +
                      new Date(group.lastPostedAt).toLocaleDateString('fa-IR')
                    : 'نامشخص';

                  return (
                    <div
                      key={group.id}
                      className="p-3 bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPostedIds([...selectedPostedIds, group.id]);
                            } else {
                              setSelectedPostedIds(selectedPostedIds.filter((id) => id !== group.id));
                            }
                          }}
                          className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500 accent-emerald-500 cursor-pointer shrink-0"
                        />

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-white truncate">{group.title}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium shrink-0">
                              ارسال موفق
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 flex-wrap">
                            <span className="dir-ltr text-sky-400 font-mono">{group.usernameOrLink}</span>
                            <span>•</span>
                            <span className="text-slate-400">آخرین ارسال: <strong className="text-slate-200">{postedDateStr}</strong></span>
                            {group.lastPostedByAccountPhone && (
                              <>
                                <span>•</span>
                                <span className="text-slate-400">ارسال توسط: <strong className="text-emerald-300 dir-ltr">{group.lastPostedByAccountPhone}</strong></span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={getTelegramUrl(group.usernameOrLink)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-400 transition-colors"
                          title="مشاهده در تلگرام"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => onDeleteGroup(group.id)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                          title="حذف از لیست هدف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>تعداد گروه‌های نمایش داده شده: <strong className="text-emerald-400 font-mono">{filteredPostedGroups.length}</strong></span>
              <button
                onClick={() => setShowPostedModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors"
              >
                بستن
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
