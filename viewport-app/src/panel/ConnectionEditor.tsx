import React, { useEffect, useState } from 'react';
import { StandardEditorProps, SelectableValue } from '@grafana/data';
import { Input, Select } from '@grafana/ui';
import { listConnections } from '../services/BackendService';

/**
 * Panel option editor for the connection name. Populates a Select from the
 * backend's sanitized connection list, but allows arbitrary custom values so
 * dashboard variables like ${server} resolve at render time. Falls back to a
 * plain text input if the connection list cannot be fetched.
 */
export const ConnectionEditor: React.FC<StandardEditorProps<string>> = ({ value, onChange }) => {
  const [options, setOptions] = useState<Array<SelectableValue<string>>>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    listConnections()
      .then((conns) => {
        if (active) {
          setOptions(conns.map((c) => ({ label: c.name, value: c.name, description: `${c.protocol}://${c.host}:${c.port}` })));
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return (
      <Input
        value={value ?? ''}
        placeholder="Connection name"
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }

  // Ensure the current value is always selectable, even if it's a custom
  // (typed) value or a dashboard variable not present in the fetched list.
  const merged =
    value && !options.some((o) => o.value === value)
      ? [...options, { label: value, value }]
      : options;

  return (
    <Select
      options={merged}
      value={value ?? null}
      placeholder="Select or type a connection"
      allowCustomValue
      onCreateOption={(v) => onChange(v)}
      onChange={(v) => onChange(v?.value ?? '')}
    />
  );
};
