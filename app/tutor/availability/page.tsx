'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import {
  getTutorAvailabilityRules,
  getTutorUnavailabilityBlocks,
  upsertAvailabilityRule,
  deleteAvailabilityRule,
  upsertUnavailabilityBlock,
  deleteUnavailabilityBlock
} from '@/lib/services/bookingService';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import { TutorAvailabilityRule, TutorUnavailabilityBlock, DAYS_OF_WEEK } from '@/lib/types/booking';
import { formatDate, formatTime, toISOString } from '@/lib/utils/calendar';

// Helper function to convert 24-hour time to 12-hour format with AM/PM
function format12Hour(time24: string): string {
  const [hourStr, minute] = time24.split(':');
  let hour = parseInt(hourStr);
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
}

export default function TutorAvailabilityPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  
  const [availabilityRules, setAvailabilityRules] = useState<TutorAvailabilityRule[]>([]);
  const [unavailabilityBlocks, setUnavailabilityBlocks] = useState<TutorUnavailabilityBlock[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Add rule form
  const [showAddRuleForm, setShowAddRuleForm] = useState(false);
  const [newRule, setNewRule] = useState({
    day_of_week: 1, // Monday
    start_time: '09:00',
    end_time: '17:00',
    slot_minutes: 60,
    buffer_minutes: 0
  });
  
  // Add block form
  const [showAddBlockForm, setShowAddBlockForm] = useState(false);
  const [newBlock, setNewBlock] = useState({
    start_date: '',
    start_time: '09:00',
    end_date: '',
    end_time: '17:00',
    reason_private: ''
  });

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    loadAvailabilityData();
  }, [profile, profileLoading, router]);

  async function loadAvailabilityData() {
    if (!profile) return;

    setLoading(true);
    try {
      const [rules, blocks] = await Promise.all([
        getTutorAvailabilityRules(profile.id),
        getTutorUnavailabilityBlocks(profile.id)
      ]);

      setAvailabilityRules(rules);
      setUnavailabilityBlocks(blocks);
    } catch (error) {
      console.error('Error loading availability:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddRule() {
    if (!profile) return;

    try {
      await upsertAvailabilityRule({
        tutor_id: profile.id,
        ...newRule,
        is_active: true
      });

      setShowAddRuleForm(false);
      setNewRule({
        day_of_week: 1,
        start_time: '09:00',
        end_time: '17:00',
        slot_minutes: 60,
        buffer_minutes: 0
      });
      await loadAvailabilityData();
    } catch (error) {
      console.error('Error adding rule:', error);
      alert('Failed to add availability rule');
    }
  }

  async function handleDeleteRule(ruleId: string) {
    if (!confirm('Delete this availability rule?')) return;

    try {
      await deleteAvailabilityRule(ruleId);
      await loadAvailabilityData();
    } catch (error) {
      console.error('Error deleting rule:', error);
      alert('Failed to delete rule');
    }
  }

  async function handleAddBlock() {
    if (!profile) return;
    if (!newBlock.start_date || !newBlock.end_date) {
      alert('Please select start and end dates');
      return;
    }

    try {
      const startAt = new Date(`${newBlock.start_date}T${newBlock.start_time}`);
      const endAt = new Date(`${newBlock.end_date}T${newBlock.end_time}`);

      await upsertUnavailabilityBlock({
        tutor_id: profile.id,
        start_at: toISOString(startAt),
        end_at: toISOString(endAt),
        reason_private: newBlock.reason_private || null,
        is_recurring: false
      });

      setShowAddBlockForm(false);
      setNewBlock({
        start_date: '',
        start_time: '09:00',
        end_date: '',
        end_time: '17:00',
        reason_private: ''
      });
      await loadAvailabilityData();
    } catch (error) {
      console.error('Error adding block:', error);
      alert('Failed to add unavailability block');
    }
  }

  async function handleDeleteBlock(blockId: string) {
    if (!confirm('Delete this unavailability block?')) return;

    try {
      await deleteUnavailabilityBlock(blockId);
      await loadAvailabilityData();
    } catch (error) {
      console.error('Error deleting block:', error);
      alert('Failed to delete block');
    }
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="tutor" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Manage Availability</h1>
        <p className="text-gray-600 mb-6">Set your teaching hours and unavailable periods</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Teaching Hours (Recurring Availability) */}
          <div className="bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-200 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Teaching Hours</h2>
              <button
                onClick={() => setShowAddRuleForm(!showAddRuleForm)}
                className="text-sm text-itutor-green hover:text-emerald-400 font-medium"
              >
                {showAddRuleForm ? 'Cancel' : '+ Add Hours'}
              </button>
            </div>

            {showAddRuleForm && (
              <div className="bg-white border-2 border-gray-300 rounded-lg p-4 mb-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                    <select
                      value={newRule.day_of_week}
                      onChange={(e) => setNewRule({ ...newRule, day_of_week: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green"
                    >
                      {DAYS_OF_WEEK.map((day, idx) => (
                        <option key={idx} value={idx}>{day}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={newRule.start_time.split(':')[0] > '12' ? String(parseInt(newRule.start_time.split(':')[0]) - 12) : (newRule.start_time.split(':')[0] === '00' ? '12' : String(parseInt(newRule.start_time.split(':')[0])))}
                          onChange={(e) => {
                            const hour = parseInt(e.target.value);
                            const currentMinute = newRule.start_time.split(':')[1];
                            const isPM = parseInt(newRule.start_time.split(':')[0]) >= 12;
                            const hour24 = isPM ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
                            setNewRule({ ...newRule, start_time: `${String(hour24).padStart(2, '0')}:${currentMinute}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          {Array.from({length: 12}, (_, i) => i + 1).map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <select
                          value={newRule.start_time.split(':')[1]}
                          onChange={(e) => {
                            const currentHour = newRule.start_time.split(':')[0];
                            setNewRule({ ...newRule, start_time: `${currentHour}:${e.target.value}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          <option value="00">00</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="45">45</option>
                        </select>
                        <select
                          value={parseInt(newRule.start_time.split(':')[0]) >= 12 ? 'PM' : 'AM'}
                          onChange={(e) => {
                            const [hourStr, minute] = newRule.start_time.split(':');
                            let hour = parseInt(hourStr);
                            if (e.target.value === 'PM') {
                              hour = hour < 12 ? hour + 12 : hour;
                            } else {
                              hour = hour >= 12 ? hour - 12 : hour;
                            }
                            setNewRule({ ...newRule, start_time: `${String(hour).padStart(2, '0')}:${minute}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={newRule.end_time.split(':')[0] > '12' ? String(parseInt(newRule.end_time.split(':')[0]) - 12) : (newRule.end_time.split(':')[0] === '00' ? '12' : String(parseInt(newRule.end_time.split(':')[0])))}
                          onChange={(e) => {
                            const hour = parseInt(e.target.value);
                            const currentMinute = newRule.end_time.split(':')[1];
                            const isPM = parseInt(newRule.end_time.split(':')[0]) >= 12;
                            const hour24 = isPM ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
                            setNewRule({ ...newRule, end_time: `${String(hour24).padStart(2, '0')}:${currentMinute}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          {Array.from({length: 12}, (_, i) => i + 1).map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <select
                          value={newRule.end_time.split(':')[1]}
                          onChange={(e) => {
                            const currentHour = newRule.end_time.split(':')[0];
                            setNewRule({ ...newRule, end_time: `${currentHour}:${e.target.value}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          <option value="00">00</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="45">45</option>
                        </select>
                        <select
                          value={parseInt(newRule.end_time.split(':')[0]) >= 12 ? 'PM' : 'AM'}
                          onChange={(e) => {
                            const [hourStr, minute] = newRule.end_time.split(':');
                            let hour = parseInt(hourStr);
                            if (e.target.value === 'PM') {
                              hour = hour < 12 ? hour + 12 : hour;
                            } else {
                              hour = hour >= 12 ? hour - 12 : hour;
                            }
                            setNewRule({ ...newRule, end_time: `${String(hour).padStart(2, '0')}:${minute}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Session Duration (minutes)</label>
                    <input
                      type="number"
                      value={newRule.slot_minutes}
                      onChange={(e) => setNewRule({ ...newRule, slot_minutes: parseInt(e.target.value) })}
                      min="15"
                      step="15"
                      className="w-full px-3 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green"
                    />
                  </div>

                  <button
                    onClick={handleAddRule}
                    className="w-full bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-2 px-4 rounded-lg font-semibold transition"
                  >
                    Add Teaching Hours
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-4 text-gray-400">Loading...</div>
            ) : availabilityRules.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No teaching hours set</p>
                <p className="text-sm mt-2">Add your available hours to start accepting bookings</p>
              </div>
            ) : (
              <div className="space-y-2">
                {availabilityRules.map((rule) => (
                  <div key={rule.id} className="bg-white border-2 border-gray-300 rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-gray-900">{DAYS_OF_WEEK[rule.day_of_week]}</p>
                      <p className="text-sm text-gray-600">
                        {format12Hour(rule.start_time)} - {format12Hour(rule.end_time)} • {rule.slot_minutes}min sessions
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-red-400 hover:text-red-300 p-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unavailability Blocks */}
          <div className="bg-white border-2 border-gray-200 shadow-lg rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Unavailable Periods</h2>
              <button
                onClick={() => setShowAddBlockForm(!showAddBlockForm)}
                className="text-sm text-itutor-green hover:text-emerald-400 font-medium"
              >
                {showAddBlockForm ? 'Cancel' : '+ Add Block'}
              </button>
            </div>

            {showAddBlockForm && (
              <div className="bg-white border-2 border-gray-300 rounded-lg p-4 mb-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={newBlock.start_date}
                        onChange={(e) => setNewBlock({ ...newBlock, start_date: e.target.value })}
                        className="w-full px-3 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={newBlock.start_time.split(':')[0] > '12' ? String(parseInt(newBlock.start_time.split(':')[0]) - 12) : (newBlock.start_time.split(':')[0] === '00' ? '12' : String(parseInt(newBlock.start_time.split(':')[0])))}
                          onChange={(e) => {
                            const hour = parseInt(e.target.value);
                            const currentMinute = newBlock.start_time.split(':')[1];
                            const isPM = parseInt(newBlock.start_time.split(':')[0]) >= 12;
                            const hour24 = isPM ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
                            setNewBlock({ ...newBlock, start_time: `${String(hour24).padStart(2, '0')}:${currentMinute}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          {Array.from({length: 12}, (_, i) => i + 1).map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <select
                          value={newBlock.start_time.split(':')[1]}
                          onChange={(e) => {
                            const currentHour = newBlock.start_time.split(':')[0];
                            setNewBlock({ ...newBlock, start_time: `${currentHour}:${e.target.value}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          <option value="00">00</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="45">45</option>
                        </select>
                        <select
                          value={parseInt(newBlock.start_time.split(':')[0]) >= 12 ? 'PM' : 'AM'}
                          onChange={(e) => {
                            const [hourStr, minute] = newBlock.start_time.split(':');
                            let hour = parseInt(hourStr);
                            if (e.target.value === 'PM') {
                              hour = hour < 12 ? hour + 12 : hour;
                            } else {
                              hour = hour >= 12 ? hour - 12 : hour;
                            }
                            setNewBlock({ ...newBlock, start_time: `${String(hour).padStart(2, '0')}:${minute}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                      <input
                        type="date"
                        value={newBlock.end_date}
                        onChange={(e) => setNewBlock({ ...newBlock, end_date: e.target.value })}
                        className="w-full px-3 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={newBlock.end_time.split(':')[0] > '12' ? String(parseInt(newBlock.end_time.split(':')[0]) - 12) : (newBlock.end_time.split(':')[0] === '00' ? '12' : String(parseInt(newBlock.end_time.split(':')[0])))}
                          onChange={(e) => {
                            const hour = parseInt(e.target.value);
                            const currentMinute = newBlock.end_time.split(':')[1];
                            const isPM = parseInt(newBlock.end_time.split(':')[0]) >= 12;
                            const hour24 = isPM ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
                            setNewBlock({ ...newBlock, end_time: `${String(hour24).padStart(2, '0')}:${currentMinute}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          {Array.from({length: 12}, (_, i) => i + 1).map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <select
                          value={newBlock.end_time.split(':')[1]}
                          onChange={(e) => {
                            const currentHour = newBlock.end_time.split(':')[0];
                            setNewBlock({ ...newBlock, end_time: `${currentHour}:${e.target.value}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          <option value="00">00</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="45">45</option>
                        </select>
                        <select
                          value={parseInt(newBlock.end_time.split(':')[0]) >= 12 ? 'PM' : 'AM'}
                          onChange={(e) => {
                            const [hourStr, minute] = newBlock.end_time.split(':');
                            let hour = parseInt(hourStr);
                            if (e.target.value === 'PM') {
                              hour = hour < 12 ? hour + 12 : hour;
                            } else {
                              hour = hour >= 12 ? hour - 12 : hour;
                            }
                            setNewBlock({ ...newBlock, end_time: `${String(hour).padStart(2, '0')}:${minute}` });
                          }}
                          className="px-2 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green text-sm"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reason (Optional - Private)
                    </label>
                    <input
                      type="text"
                      value={newBlock.reason_private}
                      onChange={(e) => setNewBlock({ ...newBlock, reason_private: e.target.value })}
                      placeholder="Only you will see this (optional)"
                      className="w-full px-3 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green placeholder-gray-500"
                    />
                  </div>

                  <button
                    onClick={handleAddBlock}
                    className="w-full bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-2 px-4 rounded-lg font-semibold transition"
                  >
                    Add Unavailability Block
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-4 text-gray-600">Loading...</div>
            ) : unavailabilityBlocks.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                <p>No unavailability blocks</p>
                <p className="text-sm mt-2">Block time for events, holidays, etc.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {unavailabilityBlocks.map((block) => (
                  <div key={block.id} className="bg-white border-2 border-gray-300 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {formatDate(block.start_at)}
                        </p>
                        <p className="text-sm text-gray-400">
                          {formatTime(block.start_at)} - {formatTime(block.end_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteBlock(block.id)}
                        className="text-red-400 hover:text-red-300 p-1"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {block.reason_private && (
                      <p className="text-sm text-gray-400 italic">{block.reason_private}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

