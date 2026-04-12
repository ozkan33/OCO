import { toast } from 'sonner';

interface UseCommentHandlersParams {
  comments: Record<string, Record<number, any[]>>;
  setComments: React.Dispatch<React.SetStateAction<Record<string, Record<number, any[]>>>>;
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
}

export function useCommentHandlers({
  comments, setComments, commentInput, setCommentInput,
  openCommentRowId, setOpenCommentRowId,
  selectedCategory, user, editingScoreCard, isScorecard,
  setScorecards, setEditingScoreCard, setSelectedCategory,
}: UseCommentHandlersParams) {

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
      const groupedComments: Record<number, any[]> = {};
      commentsData.forEach((comment: any) => {
        const rowId = parseInt(comment.row_id);
        if (!groupedComments[rowId]) groupedComments[rowId] = [];
        groupedComments[rowId].push(comment);
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
        const scorecardComments = updated[selectedCategory] || {};
        Object.keys(scorecardComments).forEach(rowId => {
          const rowIdNum = parseInt(rowId);
          const commentIndex = scorecardComments[rowIdNum]?.findIndex((c: any) => c.id === commentId);
          if (commentIndex !== -1) {
            scorecardComments[rowIdNum][commentIndex] = updatedComment;
          }
        });
        return updated;
      });
      return updatedComment;
    } catch (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  }

  async function deleteComment(commentId: string, rowId: number) {
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
    if (!commentInput.trim() || openCommentRowId == null || !isScorecard(selectedCategory) || !user) return;

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
    }
  }

  return {
    loadScorecardComments,
    updateComment,
    deleteComment,
    handleOpenCommentModal,
    handleCloseCommentModal,
    handleAddComment,
  };
}
