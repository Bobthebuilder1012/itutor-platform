'use client';

import { useState, useEffect } from 'react';
import { AvailabilityWindow, BusyBlock } from '@/lib/types/booking';

interface FlexibleTimePickerProps {
  date: Date;
  availabilityWindows: AvailabilityWindow[];
  busyBlocks: BusyBlock[];
  onTimeSelect: (startAt: string, endAt: string) => void;
  sessionDurations: { label: string; minutes: number }[];
}

export default function FlexibleTimePicker({
  date,
  availabilityWindows,
  busyBlocks,
  onTimeSelect,
  sessionDurations
}: FlexibleTimePickerProps) {
  const [selectedStartTime, setSelectedStartTime] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<number>(60); // Default 1 hour
  const [availableStartTimes, setAvailableStartTimes] = useState<string[]>([]);
  const [error, setError] = useState<string>('');

  // Generate 15-minute interval start times within availability windows
  useEffect(() => {
    const times: string[] = [];
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);

    availabilityWindows.forEach(window => {
      const windowStart = new Date(window.start_at);
      const windowEnd = new Date(window.end_at);

      // Only process windows for selected date
      if (windowStart.toDateString() !== selectedDate.toDateString()) {
        return;
      }

      // Generate 15-minute intervals
      let currentTime = new Date(windowStart);
      
      while (currentTime < windowEnd) {
        const timeString = currentTime.toTimeString().slice(0, 5); // HH:MM format
        const isoString = currentTime.toISOString();
        
        // Check if this start time + duration would fit within a window
        const endTime = new Date(currentTime.getTime() + selectedDuration * 60 * 1000);
        
        if (endTime <= windowEnd && !wouldOverlapBusy(currentTime, endTime)) {
          times.push(timeString);
        }
        
        currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000); // Add 15 minutes
      }
    });

    setAvailableStartTimes(times);
    
    // Reset selected time if it's no longer available
    if (selectedStartTime && !times.includes(selectedStartTime)) {
      setSelectedStartTime('');
    }
  }, [date, availabilityWindows, busyBlocks, selectedDuration]);

  function wouldOverlapBusy(start: Date, end: Date): boolean {
    return busyBlocks.some(block => {
      const busyStart = new Date(block.start_at);
      const busyEnd = new Date(block.end_at);
      return start < busyEnd && end > busyStart;
    });
  }

  function handleStartTimeChange(timeString: string) {
    setSelectedStartTime(timeString);
    setError('');
    
    if (timeString) {
      calculateAndSubmit(timeString, selectedDuration);
    }
  }

  function handleDurationChange(minutes: number) {
    setSelectedDuration(minutes);
    setError('');
    
    if (selectedStartTime) {
      calculateAndSubmit(selectedStartTime, minutes);
    }
  }

  function calculateAndSubmit(timeString: string, durationMinutes: number) {
    try {
      // Build full datetime
      const selectedDate = new Date(date);
      const [hours, minutes] = timeString.split(':').map(Number);
      selectedDate.setHours(hours, minutes, 0, 0);
      
      const startAt = selectedDate.toISOString();
      const endAt = new Date(selectedDate.getTime() + durationMinutes * 60 * 1000).toISOString();
      
      // Validate it fits in an availability window
      const fitsInWindow = availabilityWindows.some(window => {
        const windowStart = new Date(window.start_at);
        const windowEnd = new Date(window.end_at);
        return selectedDate >= windowStart && new Date(endAt) <= windowEnd;
      });
      
      if (!fitsInWindow) {
        setError('Selected time does not fit within tutor availability');
        return;
      }
      
      // Validate no overlap with busy blocks
      if (wouldOverlapBusy(selectedDate, new Date(endAt))) {
        setError('Selected time overlaps with an existing booking');
        return;
      }
      
      onTimeSelect(startAt, endAt);
    } catch (err) {
      setError('Invalid time selection');
      console.error('Error calculating time:', err);
    }
  }

  // Show availability windows as human-readable text
  function formatAvailabilityWindows(): string[] {
    const formatted: string[] = [];
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);

    availabilityWindows.forEach(window => {
      const windowStart = new Date(window.start_at);
      const windowEnd = new Date(window.end_at);

      if (windowStart.toDateString() === selectedDate.toDateString()) {
        const startTime = windowStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const endTime = windowEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        formatted.push(`${startTime} - ${endTime}`);
      }
    });

    return formatted;
  }

  const availabilityText = formatAvailabilityWindows();

  if (availabilityText.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-600">No availability on this date</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Show tutor's availability windows */}
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-xs font-semibold text-gray-700 mb-1">iTutor Available:</p>
        {availabilityText.map((text, idx) => (
          <p key={idx} className="text-sm text-green-700 font-medium">{text}</p>
        ))}
      </div>

      {/* Duration selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Session Duration
        </label>
        <select
          value={selectedDuration}
          onChange={(e) => handleDurationChange(Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
        >
          {sessionDurations.map(duration => (
            <option key={duration.minutes} value={duration.minutes}>
              {duration.label}
            </option>
          ))}
        </select>
      </div>

      {/* Start time selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Start Time
        </label>
        {availableStartTimes.length > 0 ? (
          <select
            value={selectedStartTime}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
          >
            <option value="">Select a start time</option>
            {availableStartTimes.map(time => (
              <option key={time} value={time}>
                {formatTime12Hour(time)}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-gray-500 py-2 px-3 bg-gray-50 rounded-lg border border-gray-200">
            No available start times for this duration
          </p>
        )}
      </div>

      {/* Show selected time range */}
      {selectedStartTime && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs font-semibold text-gray-700 mb-1">Selected Time:</p>
          <p className="text-sm text-blue-700 font-medium">
            {formatTime12Hour(selectedStartTime)} - {calculateEndTime(selectedStartTime, selectedDuration)}
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Show busy blocks as conflicts */}
      {busyBlocks.length > 0 && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-xs font-semibold text-gray-700 mb-2">Already Booked:</p>
          {busyBlocks
            .filter(block => {
              const blockStart = new Date(block.start_at);
              return blockStart.toDateString() === date.toDateString();
            })
            .map((block, idx) => {
              const start = new Date(block.start_at);
              const end = new Date(block.end_at);
              return (
                <p key={idx} className="text-xs text-gray-600">
                  {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - 
                  {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </p>
              );
            })}
        </div>
      )}
    </div>
  );
}

function formatTime12Hour(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  const endTime24 = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  return formatTime12Hour(endTime24);
}
