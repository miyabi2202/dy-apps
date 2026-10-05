import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import type { Connection } from '@dy-apps/services';
import { ConnectionForm } from '../src';

type Props = ComponentProps<typeof ConnectionForm>;

const filled: Connection = { port: '8757', roomId: '484088206186' };

function renderForm(props: Partial<Props> = {}) {
  const onChange = jest.fn();
  const onToggle = jest.fn();
  render(
    <ConnectionForm
      value={filled}
      onChange={onChange}
      connected={false}
      canConnect
      onToggle={onToggle}
      {...props}
    />,
  );
  return { onChange, onToggle };
}

const port = () => screen.getByRole('textbox', { name: '端口' });
const room = () => screen.getByRole('textbox', { name: '直播间号' });

describe('ConnectionForm', () => {
  it('reports typing in either field with the other field kept', async () => {
    function Controlled({ onChange }: { onChange: (c: Connection) => void }) {
      const [value, setValue] = useState<Connection>({ port: '', roomId: '' });
      return (
        <ConnectionForm
          value={value}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
          connected={false}
        />
      );
    }
    const onChange = jest.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.type(port(), '87');
    await userEvent.type(room(), '1');
    expect(onChange).toHaveBeenLastCalledWith({ port: '87', roomId: '1' });
  });

  it('connects from the button or Enter', async () => {
    const { onToggle } = renderForm();
    await userEvent.click(screen.getByRole('button', { name: '连接' }));
    await userEvent.type(room(), '{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("can't connect when the values aren't valid, by button or Enter", async () => {
    const { onToggle } = renderForm({ canConnect: false });
    expect(screen.getByRole('button', { name: '连接' })).toBeDisabled();
    await userEvent.type(room(), '{Enter}');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('locks the fields while connected, and the button disconnects', async () => {
    const { onToggle } = renderForm({ connected: true, canConnect: false });
    expect(port()).toBeDisabled();
    expect(room()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '断开' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('has no button without onToggle, and still locks while connected', () => {
    render(<ConnectionForm value={filled} onChange={jest.fn()} connected />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(port()).toBeDisabled();
    expect(room()).toBeDisabled();
  });
});
