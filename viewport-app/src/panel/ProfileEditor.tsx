import React, { useEffect, useState } from 'react';
import { StandardEditorProps, SelectableValue } from '@grafana/data';
import { Input, Select } from '@grafana/ui';
import { listProfiles } from '../services/BackendService';

/**
 * Panel option editor for the credential profile name (host mode). Populates a
 * Select from the backend's sanitized profile list, but allows arbitrary custom
 * values so dashboard variables resolve at render time. Falls back to a plain
 * text input if the profile list cannot be fetched.
 */
export const ProfileEditor: React.FC<StandardEditorProps<string>> = ({ value, onChange }) => {
  const [options, setOptions] = useState<Array<SelectableValue<string>>>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    listProfiles()
      .then((profiles) => {
        if (active) {
          setOptions(
            profiles.map((p) => ({
              label: p.name,
              value: p.name,
              description: `${p.protocol}${p.promptCredentials ? ' · prompt' : ''}`,
            }))
          );
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
    return <Input value={value ?? ''} placeholder="Profile name" onChange={(e) => onChange(e.currentTarget.value)} />;
  }

  const merged =
    value && !options.some((o) => o.value === value) ? [...options, { label: value, value }] : options;

  return (
    <Select
      options={merged}
      value={value ?? null}
      placeholder="Select or type a profile"
      allowCustomValue
      onCreateOption={(v) => onChange(v)}
      onChange={(v) => onChange(v?.value ?? '')}
    />
  );
};
