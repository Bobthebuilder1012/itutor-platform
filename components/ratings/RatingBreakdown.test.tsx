import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RatingBreakdown } from './RatingBreakdown';

const fullDist = { 5: 48, 4: 6, 3: 1, 2: 0, 1: 1 };

describe('RatingBreakdown', () => {
  it('renders the formatted rating number', () => {
    render(
      <RatingBreakdown rating={4.68} count={56} distribution={fullDist} />,
    );
    expect(screen.getByText('4.7')).toBeTruthy();
  });

  it('renders the total count with thousands separator', () => {
    render(
      <RatingBreakdown rating={4.2} count={1200} distribution={{ 5: 800, 4: 300, 3: 80, 2: 15, 1: 5 }} />,
    );
    expect(screen.getByText(/1,200 ratings/)).toBeTruthy();
  });

  it('renders the empty state when count is 0', () => {
    render(
      <RatingBreakdown
        rating={0}
        count={0}
        distribution={{ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }}
      />,
    );
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('No ratings yet')).toBeTruthy();
  });

  it('shows low-count note when count < 5', () => {
    render(
      <RatingBreakdown
        rating={4.0}
        count={3}
        distribution={{ 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 }}
      />,
    );
    expect(screen.getByText(/Based on a small number/)).toBeTruthy();
  });

  it('does NOT show low-count note when count >= 5', () => {
    render(
      <RatingBreakdown rating={4.0} count={10} distribution={{ 5: 6, 4: 4, 3: 0, 2: 0, 1: 0 }} />,
    );
    expect(screen.queryByText(/Based on a small number/)).toBeNull();
  });

  it('calls onFilterChange with the right star number when bar is clicked', () => {
    const onFilterChange = vi.fn();
    render(
      <RatingBreakdown
        rating={4.2}
        count={56}
        distribution={fullDist}
        onFilterChange={onFilterChange}
      />,
    );
    // The bar buttons have the star number as their first child text
    const barButtons = screen.getAllByRole('button');
    // Click the "5" bar button (first in the list)
    fireEvent.click(barButtons[0]);
    expect(onFilterChange).toHaveBeenCalledWith(5);
  });

  it('clicking the active filter bar removes the filter (calls with null)', () => {
    const onFilterChange = vi.fn();
    render(
      <RatingBreakdown
        rating={4.2}
        count={56}
        distribution={fullDist}
        onFilterChange={onFilterChange}
        activeFilter={5}
      />,
    );
    const barButtons = screen.getAllByRole('button');
    fireEvent.click(barButtons[0]);
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });

  it('bars are non-clickable in empty state (disabled)', () => {
    const onFilterChange = vi.fn();
    render(
      <RatingBreakdown
        rating={0}
        count={0}
        distribution={{ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }}
        onFilterChange={onFilterChange}
      />,
    );
    const barButtons = screen.getAllByRole('button');
    barButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
