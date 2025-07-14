import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DataGrid, type Column, type RowsChangeData, type SortColumn, type RenderEditCellProps } from 'react-data-grid';
import { FaPlus, FaTrash, FaEdit, FaRegCommentDots, FaColumns, FaRegStickyNote, FaSave } from 'react-icons/fa';
import 'react-data-grid/lib/styles.css';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useScoreCardAutoSave } from '../../hooks/useAutoSave';
import { SaveStatus, SaveStatusCompact, useBeforeUnloadWarning } from '../ui/SaveStatus';
import { supabase } from '../../../lib/supabaseClient';

interface Row {
  id: number | string;
  name?: string;
  email?: string;
  role?: string;
  storeName?: string;
  notes?: string;
  address?: string;
  isAddRow?: boolean;
  isSubRow?: boolean;
  parentId?: number | string;
  [key: string]: any;
}

type MyColumn = Column<Row> & { locked?: boolean, isDefault?: boolean };

interface ScoreCard {
  id: string;
  name: string;
  columns: MyColumn[];
  rows: Row[];
  createdAt: Date;
  lastModified: Date;
  data: any; // For storing in Supabase
}

interface AdminDataGridProps {
  userRole: string;
}

export default function AdminDataGridWithAutoSave({ userRole }: AdminDataGridProps) {
  const router = useRouter();
  
  // ScoreCard state
  const [scorecards, setScorecards] = useState<ScoreCard[]>([]);
  const [currentScorecard, setCurrentScorecard] = useState<ScoreCard | null>(null);
  const [showCreateScoreCardModal, setShowCreateScoreCardModal] = useState(false);
  const [newScoreCardName, setNewScoreCardName] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Grid state
  const [editColumns, setEditColumns] = useState(false);
  const [rowEditEnabled, setRowEditEnabled] = useState(true);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([]);
  const [showAddColModal, setShowAddColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [colError, setColError] = useState('');

  // Comment state
  const [openCommentRowId, setOpenCommentRowId] = useState<number | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [comments, setComments] = useState<Record<number, {text: string, timestamp: string, username: string}[]>>({});

  // Auto-save hook - memoized to prevent constant re-renders
  const autoSaveData = useMemo(() => {
    if (!currentScorecard) return null;
    
    return {
      id: currentScorecard.id,
      name: currentScorecard.name,
      columns: currentScorecard.columns,
      rows: currentScorecard.rows,
      data: currentScorecard.data || {},
    };
  }, [currentScorecard?.id, currentScorecard?.name, currentScorecard?.columns, currentScorecard?.rows, currentScorecard?.data]);

  const {
    status: saveStatus,
    lastSaved,
    error: saveError,
    forceSave,
    isOnline,
    hasUnsavedChanges,
  } = useScoreCardAutoSave(
    currentScorecard?.id || null,
    autoSaveData,
    {
      debounceMs: 3000,
      enableOfflineBackup: true,
      onSaveSuccess: (savedData?: any) => {
        console.log('💾 Auto-save success:', savedData);
        
        // If the scorecard was created in the database and got a new ID, update our state
        if (savedData && savedData.id && currentScorecard && currentScorecard.id !== savedData.id) {
          console.log('🔄 Updating scorecard ID from', currentScorecard.id, 'to', savedData.id);
          
          const oldId = currentScorecard.id;
          const newId = savedData.id;
          
          // Create updated scorecard object
          const updatedScorecard = {
            ...currentScorecard,
            id: newId,
            name: savedData.title || currentScorecard.name,
            lastModified: new Date(savedData.last_modified),
            data: savedData.data || currentScorecard.data,
          };
          
          // Update the scorecards list
          setScorecards(prev => prev.map(sc => 
            sc.id === oldId ? updatedScorecard : sc
          ));
          
          // Update the current scorecard
          setCurrentScorecard(updatedScorecard);
          
          // Update localStorage
          const allScorecards = JSON.parse(localStorage.getItem('scorecards') || '[]');
          const updatedLocalScorecards = allScorecards.map((sc: any) => 
            sc.id === oldId ? updatedScorecard : sc
          );
          localStorage.setItem('scorecards', JSON.stringify(updatedLocalScorecards));
          
          console.log('✅ Scorecard ID updated and synchronized');
        } else if (savedData && currentScorecard && currentScorecard.id === savedData.id) {
          // Update existing scorecard with latest data
          const updatedScorecard = {
            ...currentScorecard,
            name: savedData.title || currentScorecard.name,
            lastModified: new Date(savedData.last_modified),
            data: savedData.data || currentScorecard.data,
          };
          
          setScorecards(prev => prev.map(sc => 
            sc.id === savedData.id ? updatedScorecard : sc
          ));
          
          setCurrentScorecard(updatedScorecard);
          
          console.log('✅ Scorecard updated with latest data');
        }
        
        toast.success('Scorecard saved successfully');
      },
      onSaveError: (error) => {
        toast.error(`Save failed: ${error.message}`);
      },
    }
  );

  // Warn before leaving with unsaved changes
  useBeforeUnloadWarning(hasUnsavedChanges);

  // Test data persistence flow
  const testDataPersistence = async () => {
    console.log('🧪 Testing data persistence flow...');
    
    try {
      // 1. Create a test scorecard
      const testScorecard = {
        id: `test_scorecard_${Date.now()}`,
        name: `Test Scorecard ${new Date().toLocaleTimeString()}`,
        columns: getDefaultColumns(),
        rows: [
          { id: 1, name: 'Test Item 1', priority: 'High', retail_price: '$10.99' },
          { id: 2, name: 'Test Item 2', priority: 'Medium', retail_price: '$15.99' },
        ],
        createdAt: new Date(),
        lastModified: new Date(),
        data: {},
      };
      
      console.log('📝 Creating test scorecard:', testScorecard.name);
      setScorecards(prev => [...prev, testScorecard]);
      setCurrentScorecard(testScorecard);
      
      // Wait for auto-save to trigger
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // 2. Make a change to trigger auto-save
      console.log('✏️ Making changes to trigger auto-save...');
      const updatedScorecard = {
        ...testScorecard,
        rows: [
          ...testScorecard.rows,
          { id: 3, name: 'Test Item 3', priority: 'Low', retail_price: '$20.99' },
        ],
        lastModified: new Date(),
      };
      
      setCurrentScorecard(updatedScorecard);
      setScorecards(prev => prev.map(sc => sc.id === testScorecard.id ? updatedScorecard : sc));
      
      // Wait for auto-save to complete
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // 3. Verify data was saved
      console.log('🔍 Verifying data persistence...');
      // Removed localStorage supabase_token check; rely on cookie-based auth
      
      const response = await fetch('/api/scorecards', {
        // No Authorization header needed; cookies are sent automatically
      });
      
      if (response.ok) {
        const scorecards = await response.json();
        const savedScorecard = scorecards.find((sc: any) => sc.title === testScorecard.name);
        
        if (savedScorecard) {
          console.log('✅ Test scorecard found in database:', savedScorecard);
          console.log('📊 Rows count:', savedScorecard.data.rows?.length || 0);
          toast.success('Data persistence test passed!');
        } else {
          console.log('❌ Test scorecard not found in database');
          toast.error('Data persistence test failed - not found in database');
        }
      } else {
        console.log('❌ Failed to fetch scorecards for verification');
        toast.error('Data persistence test failed - API error');
      }
      
    } catch (error) {
      console.error('❌ Data persistence test failed:', error);
      toast.error('Data persistence test failed');
    }
  };

  // Default columns template
  const getDefaultColumns = (): MyColumn[] => [
    { key: 'name', name: 'Retailer Name', editable: true, sortable: true, isDefault: true },
    { key: 'priority', name: 'Priority', editable: true, sortable: true, isDefault: true },
    { key: 'retail_price', name: 'Retail Price', editable: true, sortable: true, isDefault: true },
    { key: 'buyer', name: 'Buyer', editable: true, sortable: true, isDefault: true },
    { key: 'store_count', name: 'Store Count', editable: true, sortable: true, isDefault: true },
    { key: 'hq_location', name: 'HQ Location', editable: true, sortable: true, isDefault: true },
    { key: 'notes', name: 'Notes', editable: true, sortable: false, isDefault: true },
  ];

  // Load user and scorecards on mount
  useEffect(() => {
    const loadData = async () => {
      console.log('🔍 loadData called');
      setLoading(true);
      try {
        console.log('🔍 Attempting fetch to /api/scorecards');
        // Always attempt to load scorecards from API
        const response = await fetch('/api/scorecards', {
          credentials: 'include',
        });
        if (response.ok) {
          const scorecardsData = await response.json();
          console.log('📥 Loaded scorecards from Supabase:', scorecardsData);
          const formattedScorecards = scorecardsData.map((sc: any) => ({
            id: sc.id,
            name: sc.title,
            columns: sc.data.columns || getDefaultColumns(),
            rows: sc.data.rows || [],
            createdAt: new Date(sc.created_at),
            lastModified: new Date(sc.last_modified),
            data: sc.data,
          }));
          // Merge with any local scorecards that might exist
          const localScorecards = JSON.parse(localStorage.getItem('scorecards') || '[]');
          const localOnlyScoreconds = localScorecards.filter((local: any) => 
            local.id.startsWith('scorecard_') && 
            !formattedScorecards.some((remote: any) => remote.name === local.name)
          );
          const allScorecards = [...formattedScorecards, ...localOnlyScoreconds];
          setScorecards(allScorecards);
          localStorage.setItem('scorecards', JSON.stringify(allScorecards));
          if (allScorecards.length > 0) {
            setCurrentScorecard(allScorecards[0]);
          }
          console.log('✅ Data synchronization complete. Total scorecards:', allScorecards.length);
        } else {
          // Fall back to local storage if API fails
          const localScorecards = JSON.parse(localStorage.getItem('scorecards') || '[]');
          setScorecards(localScorecards);
          if (localScorecards.length > 0) {
            setCurrentScorecard(localScorecards[0]);
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Failed to load scorecards');
        // Fall back to local storage on error
        const localScorecards = JSON.parse(localStorage.getItem('scorecards') || '[]');
        setScorecards(localScorecards);
        if (localScorecards.length > 0) {
          setCurrentScorecard(localScorecards[0]);
        }
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Create new scorecard
  const createScoreCard = async () => {
    if (!newScoreCardName.trim()) {
      toast.error('Please enter a scorecard name');
      return;
    }

    try {
      const response = await fetch('/api/scorecards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          title: newScoreCardName,
          data: {
            columns: getDefaultColumns(),
            rows: [],
          },
        }),
      });

      if (response.ok) {
        const newScorecard = await response.json();
        const formattedScorecard: ScoreCard = {
          id: newScorecard.id,
          name: newScorecard.title,
          columns: getDefaultColumns(),
          rows: [],
          createdAt: new Date(newScorecard.created_at),
          lastModified: new Date(newScorecard.last_modified),
          data: newScorecard.data,
        };

        setScorecards(prev => [...prev, formattedScorecard]);
        setCurrentScorecard(formattedScorecard);
        setNewScoreCardName('');
        setShowCreateScoreCardModal(false);
        toast.success('Scorecard created successfully');
      } else {
        toast.error('Failed to create scorecard');
      }
    } catch (error) {
      console.error('Error creating scorecard:', error);
      toast.error('Failed to create scorecard');
    }
  };

  // Delete scorecard
  const deleteScoreCard = async (scorecardId: string) => {
    if (!confirm('Are you sure you want to delete this scorecard?')) return;

    try {
      const response = await fetch(`/api/scorecards/${scorecardId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setScorecards(prev => prev.filter(sc => sc.id !== scorecardId));
        if (currentScorecard?.id === scorecardId) {
          const remaining = scorecards.filter(sc => sc.id !== scorecardId);
          setCurrentScorecard(remaining.length > 0 ? remaining[0] : null);
        }
        toast.success('Scorecard deleted successfully');
      } else {
        toast.error('Failed to delete scorecard');
      }
    } catch (error) {
      console.error('Error deleting scorecard:', error);
      toast.error('Failed to delete scorecard');
    }
  };

  // Update current scorecard
  const updateCurrentScorecard = useCallback((updates: Partial<ScoreCard>) => {
    if (!currentScorecard) return;

    const updatedScorecard = {
      ...currentScorecard,
      ...updates,
      lastModified: new Date(),
    };

    setCurrentScorecard(updatedScorecard);
    setScorecards(prev => prev.map(sc => 
      sc.id === currentScorecard.id ? updatedScorecard : sc
    ));
  }, [currentScorecard]);

  // Handle rows change
  const onRowsChange = useCallback((newRows: Row[]) => {
    updateCurrentScorecard({ rows: newRows });
  }, [updateCurrentScorecard]);

  // Handle column name change
  const handleColumnNameChange = useCallback((idx: number, newName: string) => {
    if (!currentScorecard) return;
    
    const newColumns = [...currentScorecard.columns];
    newColumns[idx] = { ...newColumns[idx], name: newName };
    updateCurrentScorecard({ columns: newColumns });
  }, [currentScorecard, updateCurrentScorecard]);

  // Add new row
  const handleAddRow = useCallback(() => {
    if (!currentScorecard) return;
    
    const newRow: Row = {
      id: Date.now(),
      name: '',
      priority: 'Medium',
      retail_price: 0,
      buyer: '',
      store_count: 0,
      hq_location: '',
      notes: '',
    };
    
    updateCurrentScorecard({ rows: [...currentScorecard.rows, newRow] });
  }, [currentScorecard, updateCurrentScorecard]);

  // Delete row
  const handleDeleteRow = useCallback((rowId: number | string) => {
    if (!currentScorecard) return;
    
    const newRows = currentScorecard.rows.filter(row => row.id !== rowId);
    updateCurrentScorecard({ rows: newRows });
  }, [currentScorecard, updateCurrentScorecard]);

  // Add new column
  const handleAddColumn = useCallback(() => {
    if (!newColName.trim()) {
      setColError('Column name cannot be empty');
      return;
    }

    if (!currentScorecard) return;

    const newColumn: MyColumn = {
      key: newColName.toLowerCase().replace(/\s+/g, '_'),
      name: newColName,
      editable: true,
      sortable: true,
    };

    updateCurrentScorecard({ 
      columns: [...currentScorecard.columns, newColumn] 
    });
    
    setNewColName('');
    setShowAddColModal(false);
    setColError('');
  }, [newColName, currentScorecard, updateCurrentScorecard]);

  // Handle comment operations
  const handleAddComment = useCallback(() => {
    if (!commentInput.trim() || !openCommentRowId || !user) return;

    const newComment = {
      text: commentInput,
      timestamp: new Date().toISOString(),
      username: user.email || 'Anonymous',
    };

    setComments(prev => ({
      ...prev,
      [openCommentRowId]: [...(prev[openCommentRowId] || []), newComment],
    }));

    setCommentInput('');
    setOpenCommentRowId(null);
    toast.success('Comment added');
  }, [commentInput, openCommentRowId, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex items-center gap-4">
            <SaveStatus
              status={saveStatus}
              lastSaved={lastSaved}
              error={saveError}
              hasUnsavedChanges={hasUnsavedChanges}
              isOnline={isOnline}
              onRetry={forceSave}
            />
            <button
              onClick={() => setShowCreateScoreCardModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <FaPlus /> New Scorecard
            </button>
          </div>
        </div>

        {/* Scorecard tabs */}
        <div className="flex items-center gap-2 mb-4">
          {scorecards.map((scorecard) => (
            <div
              key={scorecard.id}
              className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                currentScorecard?.id === scorecard.id
                  ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <button
                onClick={() => setCurrentScorecard(scorecard)}
                className="flex items-center flex-1"
              >
                {scorecard.name}
                <SaveStatusCompact
                  status={currentScorecard?.id === scorecard.id ? saveStatus : 'saved'}
                  lastSaved={currentScorecard?.id === scorecard.id ? lastSaved : scorecard.lastModified}
                  error={currentScorecard?.id === scorecard.id ? saveError : null}
                  hasUnsavedChanges={currentScorecard?.id === scorecard.id ? hasUnsavedChanges : false}
                  isOnline={isOnline}
                  className="ml-2"
                />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteScoreCard(scorecard.id);
                }}
                className="ml-2 text-red-600 hover:text-red-800"
              >
                <FaTrash size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Controls */}
        {currentScorecard && (
          <div className="flex items-center gap-4">
            <button
              onClick={handleAddRow}
              className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 flex items-center gap-1"
            >
              <FaPlus size={12} /> Add Row
            </button>
            <button
              onClick={() => setShowAddColModal(true)}
              className="bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 flex items-center gap-1"
            >
              <FaColumns size={12} /> Add Column
            </button>
            <button
              onClick={() => setEditColumns(!editColumns)}
              className={`px-3 py-1 rounded flex items-center gap-1 ${
                editColumns ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              <FaEdit size={12} /> {editColumns ? 'Done Editing' : 'Edit Columns'}
            </button>
            <button
              onClick={forceSave}
              disabled={saveStatus === 'saving'}
              className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
            >
              <FaSave size={12} /> Save Now
            </button>
            <button
              onClick={testDataPersistence}
              className="bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700 flex items-center gap-1"
            >
              🧪 Test Persistence
            </button>
          </div>
        )}
      </div>

      {/* Data Grid */}
      {currentScorecard ? (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <DataGrid
            columns={currentScorecard.columns as any}
            rows={currentScorecard.rows}
            onRowsChange={onRowsChange}
            className="rdg-light h-96"
            rowHeight={40}
            headerRowHeight={40}
            enableVirtualization
          />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <h2 className="text-xl font-semibold text-gray-600 mb-4">No Scorecards</h2>
          <p className="text-gray-500 mb-6">Create your first scorecard to get started</p>
          <button
            onClick={() => setShowCreateScoreCardModal(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
          >
            <FaPlus /> Create Scorecard
          </button>
        </div>
      )}

      {/* Create Scorecard Modal */}
      {showCreateScoreCardModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-xl font-semibold mb-4">Create New Scorecard</h2>
            <input
              type="text"
              value={newScoreCardName}
              onChange={(e) => setNewScoreCardName(e.target.value)}
              placeholder="Scorecard name"
              className="w-full px-3 py-2 border rounded-lg mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={createScoreCard}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex-1"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateScoreCardModal(false);
                  setNewScoreCardName('');
                }}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Column Modal */}
      {showAddColModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-xl font-semibold mb-4">Add New Column</h2>
            <input
              type="text"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="Column name"
              className="w-full px-3 py-2 border rounded-lg mb-4"
              autoFocus
            />
            {colError && (
              <p className="text-red-600 text-sm mb-4">{colError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleAddColumn}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex-1"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddColModal(false);
                  setNewColName('');
                  setColError('');
                }}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {openCommentRowId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-h-96 overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Comments</h2>
            
            {/* Existing comments */}
            <div className="mb-4 max-h-32 overflow-y-auto">
              {comments[openCommentRowId]?.map((comment, idx) => (
                <div key={idx} className="mb-2 p-2 bg-gray-50 rounded">
                  <p className="text-sm">{comment.text}</p>
                  <p className="text-xs text-gray-500">
                    {comment.username} - {new Date(comment.timestamp).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            {/* Add comment */}
            <textarea
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Add a comment..."
              className="w-full px-3 py-2 border rounded-lg mb-4 h-20"
              autoFocus
            />
            
            <div className="flex gap-2">
              <button
                onClick={handleAddComment}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex-1"
              >
                Add Comment
              </button>
              <button
                onClick={() => {
                  setOpenCommentRowId(null);
                  setCommentInput('');
                }}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 flex-1"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 