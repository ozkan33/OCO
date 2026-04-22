import { useRef, useState } from 'react';
import { toast } from 'sonner';

interface UseCommentHandlersParams {
  comments: Record<string, Record<string, any[]>>;
  setComments: React.Dispatch<React.SetStateAction<Record<string, Record<string, any[]>>>>;
  commentInput: string;
  setCommentInput: (v: string) => void;
  openCommentRowId: number | null;
  setOpenCommentRowId: (v: number | null) => void;
  selectedCategory: string;
  user: any;
  editingScoreCard: any;
  isScorecard: (id: string) => boolean;
  setScorecards: React.Dispatch<React.SetStateAction<any[]>>;
  setEditingScoreCard: React.Dispatch<React.SetStateAction<any>>;
  setSelectedCategory: (v: string) => void;
  scorecardsRef?: React.MutableRefObject<any[]>;
}

export function useCommentHandlers({
  comments, setComments, commentInput, setCommentInput,
  openCommentRowId, setOpenCommentRowId,
  selectedCategory, user, editingScoreCard, isScorecard,
  setScorecards, setEditingScoreCard, setSelectedCategory,
  scorecardsRef,
}: UseCommentHandlersParams) {
  const [isAddingComment, setIsAddingComment] = useState(false);
  const addingRef = useRef(false);

  async function loadScorecardComments(scorecardId: string) {
    try {
      if (scorecardId.startsWith('scorecard_')) {
        setComments(prev => ({ ...prev, [scorecardId]: {} }));
        return;
      }

      const response = await fetch(`/api/comments?scorecard_id=${scorecardId}`, { credentials: 'include' });
      if (!response.ok) {
        console.error('Failed to load comments:', response.status);
        return;
      }

      const commentsData = await response.json();

      // Look up the scorecard's rows so we can repair stale parent_row_ids on
      // subgrid comments (e.g. a comment on "L&B CHANHASSEN" previously stored
      // with parent_row_id pointing at the "L&B" retailer when the store
      // actually lives under "Lunds&Byerlys"). Without this repair the comment
      // would end up keyed under the wrong parent and the drawer wouldn't find it.
      const scorecardRows: any[] = scorecardsRef?.current?.find((sc: any) => sc.id === scorecardId)?.rows || [];
      const normalize = (s: string) =>
        s.trim().toLowerCase().replace(/\s*&\s*/g, '&').replace(/\s+/g, ' ');
      const findSubgridParentId = (storeName: string): string | null => {
        const n = normalize(storeName);
        if (!n) return null;
        for (const r of scorecardRows) {
          const subRows = r?.subgrid?.rows;
          if (!Array.isArray(subRows)) continue;
          const hit = subRows.find((sr: any) => {
            const sn = normalize(String(sr.store_name || ''));
            return sn && (sn === n || sn.includes(n) || n.includes(sn));
          });
          if (hit) return String(r.id);
        }
        return null;
      };

      const groupedComments: Record<string, any[]> = {};
      commentsData.forEach((comment: any) => {
        // Subgrid comments use composite key: "sub:{parentRowId}:{storeName}"
        let parentId = comment.parent_row_id ? String(comment.parent_row_id) : null;
        if (parentId && scorecardRows.length > 0) {
          const storedParent = scorecardRows.find((r: any) => String(r.id) === parentId);
          const subRows: any[] = storedParent?.subgrid?.rows || [];
          const storeName = String(comment.row_id || '');
          const n = normalize(storeName);
          const parentHasStore = subRows.some((sr: any) => {
            const sn = normalize(String(sr.store_name || ''));
            return sn && (sn === n || sn.includes(n) || n.includes(sn));
          });
          if (!parentHasStore) {
            const fixed = findSubgridParentId(storeName);
            if (fixed) parentId = fixed;
          }
        }
        const key = parentId
          ? `sub:${parentId}:${comment.row_id}`
          : String(comment.row_id);
        if (!groupedComments[key]) groupedComments[key] = [];
        groupedComments[key].push(comment);
      });

      setComments(prev => ({ ...prev, [scorecardId]: groupedComments }));
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  }

  async function updateComment(commentId: string, newText: string) {
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: newText }),
      });
      if (!response.ok) throw new Error('Failed to update comment');

      const updatedComment = await response.json();
      setComments(prev => {
        const updated = { ...prev };
        const scorecardComments = { ...(updated[selectedCategory] || {}) };
        Object.keys(scorecardComments).forEach(rowKey => {
          const list = scorecardComments[rowKey];
          if (!Array.isArray(list)) return;
          const idx = list.findIndex((c: any) => c.id === commentId);
          if (idx === -1) return;
          const nextList = list.slice();
          nextList[idx] = updatedComment;
          scorecardComments[rowKey] = nextList;
        });
        updated[selectedCategory] = scorecardComments;
        return updated;
      });
      return updatedComment;
    } catch (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  }

  async function deleteComment(commentId: string, rowId: number | string) {
    try {
      const response = await fetch(`/api/comments/${commentId}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to delete comment');

      setComments(prev => {
        const updated = { ...prev };
        const scorecardComments = updated[selectedCategory] || {};
        if (scorecardComments[rowId]) {
          scorecardComments[rowId] = scorecardComments[rowId].filter((c: any) => c.id !== commentId);
        }
        return updated;
      });
      toast.success('Comment deleted successfully!');
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
      throw error;
    }
  }

  function handleOpenCommentModal(rowId: number) {
    setOpenCommentRowId(rowId);
    setCommentInput('');
  }

  function handleCloseCommentModal() {
    setOpenCommentRowId(null);
    setCommentInput('');
  }

  async function handleAddComment() {
    if (addingRef.current) return;
    if (!commentInput.trim() || openCommentRowId == null || !isScorecard(selectedCategory) || !user) return;

    addingRef.current = true;
    setIsAddingComment(true);
    try {
      const currentScorecard = editingScoreCard;
      const requestBody: any = {
        scorecard_id: selectedCategory,
        user_id: openCommentRowId,
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

        setScorecards((prev: any[]) => prev.map(sc => sc.id === old_id ? migratedScorecard : sc));
        setEditingScoreCard(migratedScorecard);
        setSelectedCategory(new_id);

        const allScorecards = JSON.parse(localStorage.getItem('scorecards') || '[]');
        localStorage.setItem('scorecards', JSON.stringify(
          allScorecards.map((sc: any) => sc.id === old_id ? migratedScorecard : sc)
        ));

        toast.success('Scorecard migrated to database and comment added!');
        const actualScorecardId = new_id;
        setComments(prev => ({
          ...prev,
          [actualScorecardId]: {
            ...(prev[actualScorecardId] || {}),
            [openCommentRowId]: [...((prev[actualScorecardId] || {})[openCommentRowId] || []), newComment],
          }
        }));
      } else {
        setComments(prev => ({
          ...prev,
          [selectedCategory]: {
            ...(prev[selectedCategory] || {}),
            [openCommentRowId]: [...((prev[selectedCategory] || {})[openCommentRowId] || []), newComment],
          }
        }));
        toast.success('Comment added successfully!');
      }

      setCommentInput('');
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add comment');
    } finally {
      addingRef.current = false;
      setIsAddingComment(false);
    }
  }

  return {
    loadScorecardComments,
    updateComment,
    deleteComment,
    handleOpenCommentModal,
    handleCloseCommentModal,
    handleAddComment,
    isAddingComment,
  };
}
