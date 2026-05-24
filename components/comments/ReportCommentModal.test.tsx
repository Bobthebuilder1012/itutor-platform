import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReportCommentModal } from './ReportCommentModal';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe('ReportCommentModal', () => {
  it('renders title and reason options', () => {
    render(
      <ReportCommentModal
        targetType="class_comment"
        targetId="c1"
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Report this comment')).toBeInTheDocument();
    expect(screen.getByText('Spam')).toBeInTheDocument();
    expect(screen.getByText('Harassment or bullying')).toBeInTheDocument();
    expect(screen.getByText('Inappropriate language')).toBeInTheDocument();
    expect(screen.getByText('Misleading information')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('Submit is disabled until reason is selected', () => {
    render(
      <ReportCommentModal
        targetType="class_comment"
        targetId="c1"
        onClose={() => {}}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /submit report/i });
    expect(submitBtn).toBeDisabled();
  });

  it('enables Submit after selecting reason', () => {
    render(
      <ReportCommentModal
        targetType="class_comment"
        targetId="c1"
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByText('Spam'));
    expect(screen.getByRole('button', { name: /submit report/i })).not.toBeDisabled();
  });

  it('submits report with reason and optional body', async () => {
    const onClose = vi.fn();
    vi.useFakeTimers();

    render(
      <ReportCommentModal
        targetType="class_comment"
        targetId="c1"
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('Other'));
    const textarea = screen.getByPlaceholderText('Any additional context...');
    fireEvent.change(textarea, { target: { value: 'This is spammy content' } });
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/comments/class_comment/c1/reports',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'other', body: 'This is spammy content' }),
        })
      );
    });

    // success state
    expect(screen.getByText('Report received. Thank you.')).toBeInTheDocument();

    vi.advanceTimersByTime(1500);
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    vi.useRealTimers();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <ReportCommentModal
        targetType="class_comment"
        targetId="c1"
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(
      <ReportCommentModal
        targetType="class_comment"
        targetId="c1"
        onClose={onClose}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
