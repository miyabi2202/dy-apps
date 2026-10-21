import { fireEvent, render, screen } from '@testing-library/react';
import { Slider } from '..';

describe('Slider', () => {
  const props = { label: '字号', value: 16, min: 10, max: 40, onChange: () => {} };

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
