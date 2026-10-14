import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { forwardRef, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { initials } from '@/lib/format';

import { elevation, font, hashColor, MAX_WIDTH, radius, space, useTheme, type Weight } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? c.ink} />;
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
type TxtVariant = 'hero' | 'display' | 'title' | 'h2' | 'h3' | 'body' | 'small' | 'caption' | 'label';

const TXT: Record<TxtVariant, TextStyle & { weight: Weight }> = {
  hero: { fontSize: 34, letterSpacing: -1, lineHeight: 39, weight: '800' },
  display: { fontSize: 28, letterSpacing: -0.8, lineHeight: 33, weight: '800' },
  title: { fontSize: 22, letterSpacing: -0.5, lineHeight: 27, weight: '800' },
  h2: { fontSize: 18, letterSpacing: -0.3, lineHeight: 23, weight: '700' },
  h3: { fontSize: 15.5, letterSpacing: -0.1, lineHeight: 21, weight: '700' },
  body: { fontSize: 15, lineHeight: 22, weight: '400' },
  small: { fontSize: 13, lineHeight: 18, weight: '500' },
  caption: { fontSize: 12, lineHeight: 16, weight: '500' },
  label: { fontSize: 11.5, letterSpacing: 0.9, textTransform: 'uppercase', weight: '700' },
};

export function Txt({
  variant = 'body',
  muted,
  color,
  style,
  children,
  numberOfLines,
  center,
  onPress,
  selectable,
}: {
  variant?: TxtVariant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  center?: boolean;
  onPress?: () => void;
  selectable?: boolean;
}) {
  const { c } = useTheme();
  const { weight, ...base } = TXT[variant];
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight, ...rest } = flat;
  return (
    <Text
      onPress={onPress}
      selectable={selectable}
      numberOfLines={numberOfLines}
      style={[
        base,
        font(fontWeight ?? weight),
        { color: color ?? (muted || variant === 'caption' || variant === 'label' ? c.muted : c.ink) },
        center && { textAlign: 'center' },
        rest,
      ]}>
      {children}
    </Text>
  );
}

/** The product wordmark: lowercase name with a lime dot. */
export function Wordmark({ size = 22, color }: { size?: number; color?: string }) {
  const { c } = useTheme();
  return (
    <Text style={[font('800'), { fontSize: size, letterSpacing: -0.04 * size, color: color ?? c.ink }]}>
      gruppetto<Text style={{ color: c.lime }}>.</Text>
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['bottom'],
  refreshControl,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const inner = [
    { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' } as ViewStyle,
    padded && { padding: space.lg },
    contentStyle,
  ];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView keyboardShouldPersistTaps="handled" refreshControl={refreshControl} contentContainerStyle={[{ paddingBottom: space.xxl }, ...inner]}>
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, ...inner]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Row({
  children,
  gap = space.sm,
  style,
  wrap,
  align = 'center',
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  wrap?: boolean;
  align?: ViewStyle['alignItems'];
}) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Stack({ children, gap = space.md, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const { c, isDark } = useTheme();
  const base: ViewStyle = {
    backgroundColor: c.card,
    borderRadius: radius.lg,
    padding: padded ? space.lg : 0,
    borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: c.border,
    ...elevation(c, 1),
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { transform: [{ scale: 0.985 }], opacity: 0.94 }, style]}>
      {children}
    </Pressable>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }, style]} />;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.xs }}>
      <Txt variant="label">{title}</Txt>
      {action}
    </Row>
  );
}

/** Coloured rounded square with an icon — used in lists and info cards. */
export function IconTile({ icon, color, bg, size = 40 }: { icon: IconName; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Buttons & inputs
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'lime' | 'brand' | 'secondary' | 'ghost' | 'danger' | 'onHero';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
  full,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const { c } = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.inverse, fg: c.onInverse },
    lime: { bg: c.lime, fg: c.onLime },
    brand: { bg: c.brand, fg: c.onBrand },
    secondary: { bg: c.card, fg: c.ink, border: c.border },
    ghost: { bg: 'transparent', fg: c.ink },
    danger: { bg: c.dangerSoft, fg: c.danger },
    onHero: { bg: 'rgba(255,255,255,0.12)', fg: '#fff' },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor: p.bg,
          borderColor: p.border ?? 'transparent',
          borderWidth: p.border ? 1 : 0,
          borderRadius: radius.pill,
          paddingVertical: small ? 9 : 15,
          paddingHorizontal: small ? 15 : 22,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: isDisabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        full && { alignSelf: 'stretch' },
        style,
      ]}>
      {loading ? <ActivityIndicator color={p.fg} size="small" /> : icon ? <Ionicons name={icon} size={small ? 15 : 18} color={p.fg} /> : null}
      <Text style={[font('700'), { color: p.fg, fontSize: small ? 13 : 15 }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  bg,
  size = 40,
  badge,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  color?: string;
  bg?: string;
  size?: number;
  badge?: number;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg ?? c.card,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}>
      <Ionicons name={icon} size={size * 0.48} color={color ?? c.ink} />
      {!!badge && (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 19,
            height: 19,
            borderRadius: 10,
            paddingHorizontal: 5,
            backgroundColor: c.lime,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: c.hero,
          }}>
          <Text style={[font('800'), { color: c.onLime, fontSize: 10.5 }]}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export const Input = forwardRef<
  TextInput,
  TextInputProps & { label?: string; error?: string | null; hint?: string; right?: ReactNode; icon?: IconName }
>(function Input({ label, error, hint, right, icon, style, multiline, onFocus, onBlur, ...props }, ref) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight, ...rest } = flat;
  return (
    <View style={{ gap: 7 }}>
      {label ? (
        <Txt variant="small" style={{ fontWeight: '600' }}>
          {label}
        </Txt>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          backgroundColor: c.card,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: error ? c.danger : focused ? c.ink : c.border,
          paddingHorizontal: space.md + 2,
          gap: 10,
        }}>
        {icon ? <Ionicons name={icon} size={18} color={focused ? c.ink : c.faint} style={multiline ? { marginTop: 15 } : undefined} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={c.faint}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            font(fontWeight ?? '500'),
            {
              flex: 1,
              color: c.ink,
              fontSize: 16,
              paddingVertical: 14,
              minHeight: multiline ? 112 : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            Platform.OS === 'web' && ({ outlineStyle: 'none' } as object),
            rest,
          ]}
          {...props}
        />
        {right}
      </View>
      {error ? (
        <Row gap={6} align="flex-start">
          <Ionicons name="alert-circle" size={15} color={c.danger} style={{ marginTop: 1 }} />
          <Txt variant="small" color={c.danger} style={{ flex: 1 }}>
            {error}
          </Txt>
        </Row>
      ) : hint ? (
        <Txt variant="caption">{hint}</Txt>
      ) : null}
    </View>
  );
});

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  icon,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: IconName;
}) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)}>
      <Row gap={space.md} style={{ paddingVertical: space.sm }}>
        {icon ? <IconTile icon={icon} size={36} color={value ? c.brand : c.muted} bg={value ? c.brandSoft : c.subtle} /> : null}
        <View style={{ flex: 1 }}>
          <Txt style={{ fontWeight: '600' }}>{label}</Txt>
          {description ? (
            <Txt variant="small" muted>
              {description}
            </Txt>
          ) : null}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: c.brand, false: c.border }}
          thumbColor={Platform.OS === 'android' ? c.card : undefined}
          {...(Platform.OS === 'web' ? ({ activeThumbColor: '#fff' } as object) : {})}
        />
      </Row>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.subtle, borderRadius: radius.pill, padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center', backgroundColor: active ? c.card : 'transparent' },
              active && elevation(c, 1),
            ]}>
            <Text style={[font(active ? '700' : '600'), { color: active ? c.ink : c.muted, fontSize: 14 }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontally scrolling single-select pills. */
export function PillPicker<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} icon={o.icon} active={o.value === value} onPress={() => onChange(o.value)} size="md" />
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Chips, avatars
// ---------------------------------------------------------------------------
export function Chip({
  label,
  icon,
  active,
  onPress,
  tone,
  size = 'sm',
}: {
  label: string;
  icon?: IconName;
  active?: boolean;
  onPress?: () => void;
  tone?: 'brand' | 'accent' | 'danger' | 'warn';
  size?: 'sm' | 'md';
}) {
  const { c } = useTheme();
  const toneColors = tone
    ? { brand: [c.brandSoft, c.brand], accent: [c.accentSoft, c.accent], danger: [c.dangerSoft, c.danger], warn: [c.warnSoft, c.warn] }[tone]
    : null;
  const bg = active ? c.inverse : toneColors ? toneColors[0] : c.subtle;
  const fg = active ? c.onInverse : toneColors ? toneColors[1] : c.ink;
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: size === 'md' ? 14 : 10,
        paddingVertical: size === 'md' ? 9 : 5,
        borderRadius: radius.pill,
        backgroundColor: bg,
      }}>
      {icon ? <Ionicons name={icon} size={size === 'md' ? 15 : 13} color={fg} /> : null}
      <Text style={[font('600'), { color: fg, fontSize: size === 'md' ? 14 : 12.5 }]}>{label}</Text>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function Avatar({ name, url, size = 36, ring }: { name: string; url?: string | null; size?: number; ring?: string }) {
  const style: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hashColor(name),
    borderWidth: ring ? 2 : 0,
    borderColor: ring,
  };
  return (
    <View style={style}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
      ) : (
        <Text style={[font('700'), { color: '#fff', fontSize: size * 0.38 }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 28,
  ring,
}: {
  people: { id: string; name: string; url?: string | null }[];
  max?: number;
  size?: number;
  ring?: string;
}) {
  const { c } = useTheme();
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View style={{ flexDirection: 'row' }}>
      {shown.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Avatar name={p.name} url={p.url} size={size} ring={ring ?? c.card} />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={{
            marginLeft: -size * 0.3,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: c.subtle,
            borderWidth: 2,
            borderColor: ring ?? c.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={[font('700'), { fontSize: size * 0.34, color: c.ink }]}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ClubLogo({ name, url, color, size = 32 }: { name: string; url?: string | null; color?: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        overflow: 'hidden',
        backgroundColor: color ?? hashColor(name),
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <Text style={[font('800'), { color: '#fff', fontSize: size * 0.36, letterSpacing: -0.5 }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------
export function Loading({ label }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: 12, backgroundColor: c.bg }}>
      <ActivityIndicator color={c.brand} />
      {label ? <Txt muted>{label}</Txt> : null}
    </View>
  );
}

/** Pulsing placeholder block. */
export function Skeleton({ width, height, radius: r = 10, style }: { width?: ViewStyle['width']; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  return <Animated.View style={[{ width: width ?? '100%', height, borderRadius: r, backgroundColor: c.subtle, opacity: pulse }, style]} />;
}

export function SkeletonCard() {
  return (
    <Card>
      <Row gap={space.md} align="flex-start">
        <Skeleton width={54} height={62} radius={14} />
        <Stack gap={8} style={{ flex: 1 }}>
          <Skeleton height={18} width="75%" />
          <Skeleton height={13} width="50%" />
        </Stack>
      </Row>
      <Row gap={8} style={{ marginTop: space.lg }}>
        <Skeleton height={26} width={70} radius={13} />
        <Skeleton height={26} width={80} radius={13} />
        <Skeleton height={26} width={60} radius={13} />
      </Row>
    </Card>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl * 1.5, paddingHorizontal: space.xl, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: c.hero, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Ionicons name={icon} size={30} color={c.lime} />
      </View>
      <Txt variant="h2" center>
        {title}
      </Txt>
      {body ? (
        <Txt muted center style={{ maxWidth: 320 }}>
          {body}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

export function Banner({ tone = 'warn', icon, children }: { tone?: 'warn' | 'danger' | 'brand'; icon?: IconName; children: ReactNode }) {
  const { c } = useTheme();
  const [bg, fg] = { warn: [c.warnSoft, c.warn], danger: [c.dangerSoft, c.danger], brand: [c.brandSoft, c.brand] }[tone];
  return (
    <Row gap={10} style={{ backgroundColor: bg, borderRadius: radius.md, padding: space.md }} align="flex-start">
      <Ionicons name={icon ?? 'information-circle'} size={18} color={fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <Txt color={fg} style={{ fontWeight: '600' }}>{children}</Txt> : children}</View>
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} />
      <View
        style={{
          backgroundColor: c.card,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingHorizontal: space.lg + 4,
          paddingTop: space.md,
          paddingBottom: insets.bottom + space.lg,
          maxHeight: '88%',
          width: '100%',
          maxWidth: MAX_WIDTH,
          alignSelf: 'center',
        }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: space.md }} />
        {title ? (
          <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
            <Txt variant="title">{title}</Txt>
            <IconButton icon="close" label="Close" onPress={onClose} bg={c.subtle} size={34} />
          </Row>
        ) : null}
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Cross-platform dialogs (Alert.alert has no buttons on web)
// ---------------------------------------------------------------------------
export function confirmAsync(title: string, message: string, confirmLabel = 'OK', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}

export function showMessage(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}
