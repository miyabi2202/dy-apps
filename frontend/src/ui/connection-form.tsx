import type { Connection } from '@dy-apps/services';
import * as stylex from '@stylexjs/stylex';
import { Button } from './button';
import { Field, Input } from './form';
import { Row } from './layout';
import { connectionFormText as t } from './messages';

interface ConnectionFormProps {
  value: Connection;
  onChange: (next: Connection) => void;
  /** Locks the inputs, and turns the button into 断开. */
  connected: boolean;
  /** Whether `value` is valid. The caller decides, so this stays free of any protocol. */
  canConnect?: boolean;
  /**
   * Called by the button (or Enter) to connect or, when connected, disconnect. Leave it
   * out for just the fields, when something else starts the connection.
   */
  onToggle?: () => void;
  portPlaceholder?: string;
}

/** A local event hub's port and a live room's number, with an optional connect / disconnect button. */
export function ConnectionForm({
  value,
  onChange,
  connected,
  canConnect = false,
  onToggle,
  portPlaceholder,
}: ConnectionFormProps) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (onToggle && (connected || canConnect)) onToggle();
      }}
    >
      <Row gap="md" align="end" wrap>
        <Field label={t.port} xstyle={styles.portField}>
          <Input
            value={value.port}
            disabled={connected}
            inputMode="numeric"
            placeholder={portPlaceholder}
            onChange={(e) => onChange({ ...value, port: e.target.value })}
          />
        </Field>
        <Field label={t.room} xstyle={styles.roomField}>
          <Input
            value={value.roomId}
            disabled={connected}
            inputMode="numeric"
            placeholder="如 484088206186"
            onChange={(e) => onChange({ ...value, roomId: e.target.value })}
          />
        </Field>
        {onToggle && (
          <Button
            type="submit"
            variant={connected ? 'default' : 'primary'}
            disabled={!connected && !canConnect}
          >
            {connected ? t.disconnect : t.connect}
          </Button>
        )}
      </Row>
    </form>
  );
}

const styles = stylex.create({
  roomField: {
    flexGrow: 1,
    minWidth: 160,
  },
  portField: {
    width: 96,
  },
});
