import { render, screen } from '@testing-library/react';
import { Field, Input, Select, useFieldId } from '..';

describe('Field', () => {
  it('labels its Input', () => {
    render(
      <Field label="端口">
        <Input defaultValue="8757" />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: '端口' })).toHaveValue('8757');
  });

  it("labels its Select, and the label's name is just the label", () => {
    render(
      <Field label="方向">
        <Select defaultValue="down">
          <option value="up">向上</option>
          <option value="down">向下</option>
        </Select>
      </Field>,
    );
    expect(screen.getByRole('combobox', { name: '方向' })).toHaveValue('down');
  });

  it('gives each Field its own id', () => {
    render(
      <>
        <Field label="端口">
          <Input />
        </Field>
        <Field label="直播间号">
          <Input />
        </Field>
      </>,
    );
    const port = screen.getByRole('textbox', { name: '端口' });
    const room = screen.getByRole('textbox', { name: '直播间号' });
    expect(port.id).not.toBe(room.id);
  });

  it('lets a custom control use the id through useFieldId', () => {
    function Custom() {
      return <textarea id={useFieldId()} />;
    }
    render(
      <Field label="备注">
        <Custom />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: '备注' })).toBeInstanceOf(HTMLTextAreaElement);
  });
});

describe('Input and Select', () => {
  it('keep an explicit id', () => {
    render(
      <Field label="端口">
        <Input id="port" />
      </Field>,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'port');
  });

  it('work outside a Field', () => {
    render(<Input aria-label="搜索" />);
    expect(screen.getByRole('textbox', { name: '搜索' })).not.toHaveAttribute('id');
  });
});
