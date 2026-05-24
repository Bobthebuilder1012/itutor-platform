import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StarInput } from './StarInput';

describe('StarInput', () => {
  it('renders 5 star buttons', () => {
    render(<StarInput value={0} />);
    const buttons = screen.getAllByRole('radio');
    expect(buttons).toHaveLength(5);
  });

  it('calls onChange when a star is clicked', () => {
    const onChange = vi.fn();
    render(<StarInput value={0} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('3 stars'));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('clicking each star calls onChange with correct value', () => {
    const onChange = vi.fn();
    render(<StarInput value={0} onChange={onChange} />);
    for (let i = 1; i <= 5; i++) {
      fireEvent.click(screen.getByLabelText(`${i} star${i > 1 ? 's' : ''}`));
      expect(onChange).toHaveBeenCalledWith(i);
    }
  });

  it('does not call onChange when readOnly', () => {
    const onChange = vi.fn();
    render(<StarInput value={3} onChange={onChange} readOnly />);
    fireEvent.click(screen.getByLabelText('1 star'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses ArrowRight key to increment value', () => {
    const onChange = vi.fn();
    render(<StarInput value={2} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText('3 stars'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('uses ArrowLeft key to decrement value', () => {
    const onChange = vi.fn();
    render(<StarInput value={3} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText('2 stars'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('does not go below 1 on ArrowLeft', () => {
    const onChange = vi.fn();
    render(<StarInput value={1} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText('1 star'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('does not go above 5 on ArrowRight', () => {
    const onChange = vi.fn();
    render(<StarInput value={5} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText('5 stars'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(5);
  });
});
