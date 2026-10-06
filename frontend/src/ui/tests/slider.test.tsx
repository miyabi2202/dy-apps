import { fireEvent, render, screen } from '@testing-library/react';
import { Slider } from '..';

describe('Slider', () => {
  const props = { label: '字号', value: 16, min: 10, max: 40, onChange: () => {} };

  it('is a range input named by its label', () => {
    render(<Slider {...props} step={2} />);
    const slider = screen.getByRole('slider', { name: '字号' });
    expect(slider).toHaveValue('16');
    expect(slider).toHaveAttribute('min', '10');
    expect(slider).toHaveAttribute('max', '40');
    expect(slider).toHaveAttribute('step', '2');
  });

  it('shows the value with its unit', () => {
    render(<Slider {...props} unit="px" />);
    expect(screen.getByRole('status')).toHaveTextContent('16px');
  });

  it('calls onChange with a number', () => {
    const onChange = jest.fn();
    render(<Slider {...props} onChange={onChange} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '24' } });
    expect(onChange).toHaveBeenCalledWith(24);
  });
});
