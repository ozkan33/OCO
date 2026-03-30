'use client';
import React from 'react';
import type { Row } from './types';

interface Comment {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  updated_at?: string;
}

interface CommentDrawerProps {
  rowId: number;
  row: Partial<Row>;
  comments: Comment[];
  currentUser: any;
  commentInput: string;
  editCommentIdx: number | null;
  editCommentText: string;
  onClose: () => void;
  onCommentInputChange: (v: string) => void;
  onAddComment: () => void;
  onEditComment: (idx: number, text: string) => void;
  onSaveEditComment: (idx: number) => void;
  onCancelEditComment: () => void;
  onEditCommentTextChange: (v: string) => void;
  onRequestDeleteComment: (rowId: number, commentIdx: number) => void;
}

export default function CommentDrawer({
  row,
  comments,
  currentUser,
  commentInput,
  editCommentIdx,
  editCommentText,
  onClose,
  onCommentInputChange,
  onAddComment,
  onEditComment,
  onSaveEditComment,
  onCancelEditComment,
  onEditCommentTextChange,
  onRequestDeleteComment,
}: CommentDrawerProps) {
  const rowId = typeof row.id === 'number' ? row.id : null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-40 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="relative ml-auto w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slideInRight rounded-l-2xl border-l border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-8 py-6 bg-gray-50 rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{row.name || 'Row'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-3xl font-bold">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col px-8 py-6 overflow-y-auto bg-gray-50">
          <h3 className="text-base font-semibold text-gray-700 mb-4">Comments</h3>

          {/* Comment list */}
          <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1" style={{ maxHeight: '40vh' }}>
            {rowId !== null && comments.length > 0 ? (
              <ul className="space-y-4 list-none p-0 m-0">
                {comments.map((c, i) => {
                  const isAuthor = currentUser?.id === c.user_id;
                  const displayName = currentUser?.name || currentUser?.email || 'Anonymous';
                  const createdAt = new Date(c.created_at).toLocaleString();
                  return (
                    <li key={c.id || i} className="flex items-start gap-4 bg-white rounded-2xl shadow border border-gray-200 p-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                        {displayName[0]?.toUpperCase() || 'A'}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-gray-800">{displayName}</span>
                          <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">{createdAt}</span>
                        </div>
                        {editCommentIdx === i ? (
                          <div className="flex flex-col gap-2 mt-1">
                            <textarea
                              value={editCommentText}
                              onChange={e => onEditCommentTextChange(e.target.value)}
                              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base"
                              rows={2}
                              autoFocus
                            />
                            <div className="flex gap-2 mt-1">
                              <button
                                onClick={() => onSaveEditComment(i)}
                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-semibold"
                              >Save</button>
                              <button
                                onClick={onCancelEditComment}
                                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs font-semibold"
                              >Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-gray-700 text-sm">{c.text}</p>
                            {isAuthor && (
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => onEditComment(i, c.text)}
                                  className="text-xs text-blue-500 hover:text-blue-700"
                                >Edit</button>
                                {rowId !== null && (
                                  <button
                                    onClick={() => onRequestDeleteComment(rowId, i)}
                                    className="text-xs text-red-500 hover:text-red-700"
                                  >Delete</button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 italic">No comments yet.</p>
            )}
          </div>

          {/* Add comment */}
          <div className="mt-auto pt-4 border-t border-gray-200">
            <textarea
              value={commentInput}
              onChange={e => onCommentInputChange(e.target.value)}
              placeholder="Add a comment..."
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm resize-none focus:outline-none focus:border-blue-400"
              rows={3}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={onAddComment}
                disabled={!commentInput.trim()}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                Post Comment
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
