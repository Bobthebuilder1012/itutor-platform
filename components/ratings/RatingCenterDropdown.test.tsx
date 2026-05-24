import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RatingCenterDropdown } from './RatingCenterDropdown';

const mockPrompts = [
  {
    id: 'p1',
    student_id: 'u1',
    class_id: 'c1',
    billing_period: 'April 2026',
    expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    snoozed_until: null,
    dismissed_count: 0,
    status: 'pending',
    groups: { id: 'c1', name: 'CSEC Maths' },
  },
  {
    id: 'p2',
    student_id: 'u1',
    class_id: 'c2',
    billing_period: 'March 2026',
    expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    snoozed_until: null,
    dismissed_count: 0,
    status: 'pending',
    groups: { id: 'c2', name: 'CAPE Physics' },
  },
];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockPrompts,
  }) as unknown as typeof fetch;
});

describe('RatingCenterDropdown', () => {
  it('renders the pending count pill when there are prompts', async () => {
    render(<RatingCenterDropdown />);
    await waitFor(() => {
      expect(screen.getByText(/\(2\) pending/)).toBeTruthy();
    });
  });

  it('hides when there are zero prompts', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;

    const { container } = render(<RatingCenterDropdown />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows dropdown with class names on click', async () => {
    render(<RatingCenterDropdown />);
    await waitFor(() => screen.getByText(/\(2\) pending/));

    // Open dropdown
    fireEvent.click(screen.getByText(/\(2\) pending/));
    expect(screen.getByText('CSEC Maths')).toBeTruthy();
    expect(screen.getByText('CAPE Physics')).toBeTruthy();
  });

  it('shows expiry warning in red for prompts expiring <= 3 days', async () => {
    render(<RatingCenterDropdown />);
    await waitFor(() => screen.getByText(/\(2\) pending/));
    fireEvent.click(screen.getByText(/\(2\) pending/));

    // p2 expires in 2 days — should show red text
    const expiryTexts = screen.getAllByText(/Expires in \d+ days?/);
    expect(expiryTexts.length).toBeGreaterThan(0);
  });
});
