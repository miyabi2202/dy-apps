import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '..';

describe('Checkbox', () => {
  it('is labelled by its label and toggles when the label is clicked', async () => {
    const onChange = jest.fn();
    render(<Checkbox label="显示头像" onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: '显示头像' });
    expect(box).not.toBeChecked();

    await userEvent.click(screen.getByText('显示头像'));
    expect(box).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
