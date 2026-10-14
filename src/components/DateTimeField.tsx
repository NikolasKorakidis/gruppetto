import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fmtDateLong, fmtTime } from '@/lib/format';

import { radius, space, useTheme } from './theme';
import { Button, Icon, IconButton, Row, Sheet, Stack, Txt } from './ui';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

/** Pure-JS date & time picker: identical on iOS, Android and web. */
export function DateTimeField({ value, onChange, label }: { value: Date; onChange: (d: Date) => void; label?: string }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [month, setMonth] = useState(new Date(value.getFullYear(), value.getMonth(), 1));

  const days = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const inMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: inMonth }, (_, i) => i + 1)];
  }, [month]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const setDay = (d: number) => {
    const next = new Date(draft);
    next.setFullYear(month.getFullYear(), month.getMonth(), d);
    setDraft(next);
  };
  const setHour = (h: number) => {
    const next = new Date(draft);
    next.setHours(h);
    setDraft(next);
  };
  const setMinute = (m: number) => {
    const next = new Date(draft);
    next.setMinutes(m, 0, 0);
    setDraft(next);
  };

  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt variant="small" style={{ fontWeight: '600' }}>{label}</Txt> : null}
      <Pressable
        onPress={() => {
          setDraft(value);
          setMonth(new Date(value.getFullYear(), value.getMonth(), 1));
          setOpen(true);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: c.card,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: c.border,
          padding: 13,
        }}>
        <Icon name="calendar-outline" size={18} color={c.muted} />
        <Txt style={{ flex: 1 }}>{fmtDateLong(value.toISOString())}</Txt>
        <Txt style={{ fontWeight: '700' }}>{fmtTime(value.toISOString())}</Txt>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Date & start time">
        <Stack gap={space.lg}>
          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton icon="chevron-back" label="Previous month" bg={c.subtle} size={34} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
            <Txt variant="h3">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Txt>
            <IconButton icon="chevron-forward" label="Next month" bg={c.subtle} size={34} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
          </Row>
          <View>
            <Row gap={0}>
              {WEEKDAYS.map((d) => (
                <Txt key={d} variant="caption" center style={{ flex: 1 }}>
                  {d}
                </Txt>
              ))}
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
              {days.map((d, i) => {
                if (d === null) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 42 }} />;
                const date = new Date(month.getFullYear(), month.getMonth(), d);
                const selected =
                  draft.getFullYear() === date.getFullYear() && draft.getMonth() === date.getMonth() && draft.getDate() === d;
                const past = date < today;
                return (
                  <Pressable key={d} disabled={past} onPress={() => setDay(d)} style={{ width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? c.inverse : 'transparent',
                      }}>
                      <Text style={{ color: selected ? c.onInverse : past ? c.faint : c.ink, fontWeight: selected ? '800' : '500' }}>{d}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Txt variant="label">Hour</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {HOURS.map((h) => (
                <TimePill key={h} label={h.toString().padStart(2, '0')} active={draft.getHours() === h} onPress={() => setHour(h)} />
              ))}
            </View>
            <Txt variant="label">Minutes</Txt>
            <Row gap={6}>
              {MINUTES.map((m) => (
                <TimePill key={m} label={`:${m.toString().padStart(2, '0')}`} active={draft.getMinutes() === m} onPress={() => setMinute(m)} />
              ))}
            </Row>
          </View>
          <Button
            title={`Set ${fmtDateLong(draft.toISOString())} · ${fmtTime(draft.toISOString())}`}
            onPress={() => {
              onChange(draft);
              setOpen(false);
            }}
          />
        </Stack>
      </Sheet>
    </View>
  );
}

function TimePill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 50,
        paddingVertical: 9,
        borderRadius: radius.md,
        alignItems: 'center',
        backgroundColor: active ? c.inverse : c.subtle,
      }}>
      <Text style={{ color: active ? c.onInverse : c.ink, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{label}</Text>
    </Pressable>
  );
}
