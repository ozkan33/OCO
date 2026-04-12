'use client';
import React from 'react';
import { toast } from 'sonner';
import { useAdminGrid } from './AdminDataGridContext';

// Shared comment list used by both drawer variants
function CommentList({ rowId }: { rowId: number }) {
  const {
    comments, selectedCategory, user,
    editCommentIdx, editCommentText, setEditCommentIdx, setEditCommentText,
    updateComment, setConfirmDeleteComment,
  } = useAdminGrid();

  const rowComments = comments[selectedCategory]?.[rowId] || [];

  if (rowComments.length === 0) {
    return <div className="text-slate-400 text-center py-8">No comments yet. Be the first to comment!</div>;
  }

  return (
    <>
      {rowComments.map((c: any, i: number) => {
        const isAuthor = user?.id === c.user_id;
        const displayName = user?.name || user?.email || 'Anonymous';
        const createdAt = new Date(c.created_at).toLocaleString();
        return (
          <li key={c.id || i} className="flex items-start gap-3 bg-white rounded-xl shadow border border-slate-200 p-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
              {displayName[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-slate-800">{displayName}</span>
                <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">{createdAt}</span>
              </div>
              {editCommentIdx === i ? (
                <div className="flex flex-col gap-2 mt-1">
                  <textarea
                    value={editCommentText}
                    onChange={e => setEditCommentText(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
                    rows={2}
                    autoFocus
                  />
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={async () => {
                        try {
                          const comment = comments[selectedCategory][rowId][i];
                          await updateComment(comment.id, editCommentText);
                          setEditCommentIdx(null);
                          setEditCommentText('');
                          toast.success('Comment updated!');
                        } catch {
                          toast.error('Failed to update comment');
                        }
                      }}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-semibold"
                    >Save</button>
                    <button
                      onClick={() => { setEditCommentIdx(null); setEditCommentText(''); }}
                      className="px-3 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 text-xs font-semibold"
                    >Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="text-slate-700 text-sm whitespace-pre-line mt-1">{c.text}</div>
              )}
              {isAuthor && editCommentIdx !== i && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => { setEditCommentIdx(i); setEditCommentText(c.text); }}
                    className="text-xs text-blue-600 hover:underline px-2 py-1 rounded"
                  >Edit</button>
                  <button
                    onClick={() => setConfirmDeleteComment({ rowId, commentIdx: i })}
                    className="text-xs text-red-500 hover:underline px-2 py-1 rounded"
                  >Delete</button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </>
  );
}

// Shared comment input form
function CommentInput({ onSubmit }: { onSubmit: () => void }) {
  const { user, commentInput, setCommentInput } = useAdminGrid();

  return (
    <form
      onSubmit={e => { e.preventDefault(); onSubmit(); }}
      className="pt-4 border-t bg-white rounded-b-2xl flex gap-3 items-start mt-2"
      style={{ borderTop: '1px solid #e5e7eb' }}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg mt-1">
        {(user?.name || user?.username || 'A')[0].toUpperCase()}
      </div>
      <div className="flex-1">
        <textarea
          value={commentInput}
          onChange={e => setCommentInput(e.target.value)}
          className="w-full rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-blue-500 px-4 py-3 text-base bg-white shadow-sm resize-none min-h-[44px] transition-all"
          placeholder="Add a comment..."
          rows={commentInput.length > 60 ? 4 : 2}
          style={{ minHeight: 44, maxHeight: 120, marginBottom: 8 }}
          onFocus={e => e.currentTarget.rows = 4}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
        />
        <button
          type="submit"
          className="mt-2 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-base font-semibold shadow transition-all float-right"
          style={{ minWidth: 120 }}
        >
          Add
        </button>
      </div>
    </form>
  );
}

// ─── Simple Comment Drawer (opened from comment icon) ───────────────────────
export function SimpleCommentDrawer() {
  const { openCommentRowId, handleCloseCommentModal, handleAddComment, getCurrentData } = useAdminGrid();

  if (openCommentRowId === null) return null;

  const row = getCurrentData()?.rows.find((r: any) => r.id === openCommentRowId) || {};

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black bg-opacity-40 transition-opacity" onClick={handleCloseCommentModal}></div>
      <div className="relative ml-auto w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slideInRight rounded-l-2xl border-l border-slate-200">
        <div className="flex items-center justify-between border-b px-8 py-6 bg-slate-50 rounded-t-2xl">
          <h2 className="text-2xl font-bold text-slate-900">{row.name || 'Row'}</h2>
          <button onClick={handleCloseCommentModal} className="text-slate-400 hover:text-slate-700 text-3xl font-bold">×</button>
        </div>
        <div className="flex-1 flex flex-col px-8 py-6 overflow-y-auto bg-slate-50">
          <h3 className="text-base font-semibold text-slate-700 mb-4">Comments</h3>
          <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1" style={{ maxHeight: '40vh' }}>
            {typeof row.id === 'number' && <CommentList rowId={row.id} />}
          </div>
          <CommentInput onSubmit={handleAddComment} />
        </div>
      </div>
    </div>
  );
}

// ─── Retailer Drawer (opened from row click — has address + comments) ───────
export function RetailerDrawer() {
  const ctx = useAdminGrid();
  const {
    openRetailerDrawer, selectedCategory, user,
    commentInput, setCommentInput, editingScoreCard,
    getCurrentData, updateCurrentData, isScorecard,
    setScorecards, setEditingScoreCard, setSelectedCategory,
    setOpenRetailerDrawer, setComments,
  } = ctx;

  if (openRetailerDrawer === null || !selectedCategory || !isScorecard(selectedCategory)) return null;

  const currentData = getCurrentData();
  const row = currentData?.rows.find((r: any) => r.id === openRetailerDrawer) || {};

  const handleAddRetailerComment = async () => {
    if (!commentInput.trim() || openRetailerDrawer == null || !selectedCategory || !user) return;

    try {
      const currentScorecard = editingScoreCard;
      const requestBody: any = {
        scorecard_id: selectedCategory,
        user_id: openRetailerDrawer,
        text: commentInput.trim(),
        scorecard_data: selectedCategory.startsWith('scorecard_') ? {
          name: currentScorecard?.name || 'Untitled Scorecard',
          columns: currentScorecard?.columns || [],
          rows: currentScorecard?.rows || []
        } : undefined
      };

      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add comment');
      }

      const newComment = await response.json();

      if (newComment.migrated_scorecard) {
        const { old_id, new_id, title } = newComment.migrated_scorecard;
        const migratedScorecard = {
          ...currentScorecard!,
          id: new_id,
          name: title,
          columns: currentScorecard?.columns || [],
          rows: currentScorecard?.rows || [],
          createdAt: currentScorecard?.createdAt || new Date(),
          lastModified: new Date()
        };

        setScorecards((prev: any[]) => prev.map(sc =>
          sc.id === old_id ? migratedScorecard : sc
        ).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));

        setEditingScoreCard(migratedScorecard);
        setSelectedCategory(new_id);

        const allScorecards = JSON.parse(localStorage.getItem('scorecards') || '[]');
        const updatedLocalScorecards = allScorecards.map((sc: any) =>
          sc.id === old_id ? migratedScorecard : sc
        );
        localStorage.setItem('scorecards', JSON.stringify(updatedLocalScorecards));
        setOpenRetailerDrawer(null);
        toast.success('Scorecard migrated to database and comment added!');

        setComments((prev: any) => ({
          ...prev,
          [new_id]: {
            ...(prev[new_id] || {}),
            [openRetailerDrawer]: [...((prev[new_id] || {})[openRetailerDrawer] || []), newComment],
          }
        }));
      } else {
        setComments((prev: any) => ({
          ...prev,
          [selectedCategory]: {
            ...(prev[selectedCategory] || {}),
            [openRetailerDrawer]: [...((prev[selectedCategory] || {})[openRetailerDrawer] || []), newComment],
          }
        }));
        toast.success('Comment added successfully!');
      }

      setCommentInput('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add comment');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black bg-opacity-40 transition-opacity" onClick={() => setOpenRetailerDrawer(null)}></div>
      <div className="relative ml-auto w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slideInRight rounded-l-2xl border-l border-slate-200">
        <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-50 rounded-t-2xl">
          <h2 className="text-xl font-bold text-slate-900">{row.name || 'Row'}</h2>
          <button onClick={() => setOpenRetailerDrawer(null)} className="text-slate-400 hover:text-slate-700 text-2xl font-bold">×</button>
        </div>
        <div className="flex-1 flex flex-col px-6 py-4 overflow-y-auto">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Address</label>
            <input
              type="text"
              value={row.address || ''}
              onChange={e => {
                if (!currentData || row.id === undefined) return;
                const updatedRows = currentData.rows.map((r: any) => r.id === row.id ? { ...r, address: e.target.value } : r);
                updateCurrentData({ rows: updatedRows });
              }}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Enter address..."
            />
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Comments</h3>
          <div className="flex-1 overflow-y-auto mb-2 space-y-4 pr-1" style={{ maxHeight: '40vh' }}>
            {typeof row.id === 'number' && <CommentList rowId={row.id} />}
          </div>
          <div className="pt-4 border-t bg-slate-50 rounded-b-2xl flex gap-3 items-start mt-2" style={{ borderTop: '1px solid #e5e7eb' }}>
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg mt-1">
              {(user?.name || user?.username || 'A')[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <textarea
                value={commentInput}
                onChange={e => setCommentInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-blue-500 px-4 py-2 text-sm bg-white shadow-sm resize-none min-h-[44px] transition-all"
                placeholder="Add a comment..."
                rows={commentInput.length > 60 ? 4 : 2}
                style={{ minHeight: 44, maxHeight: 120, marginBottom: 8 }}
                onFocus={e => e.currentTarget.rows = 4}
                onBlur={e => e.currentTarget.rows = commentInput.length > 60 ? 4 : 2}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddRetailerComment(); } }}
              />
              <button
                onClick={handleAddRetailerComment}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow transition-all float-right"
                style={{ minWidth: 120 }}
              >
                Add Comment
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SimpleCommentDrawer;
