// Shared color tokens — white / light blue / cream palette.
export const colors = {
  background: '#FFFFFF',
  surface: '#FFF8EC',
  surfaceAlt: '#FFF3DD',
  border: '#E8DCC8',
  divider: '#F0E6D6',

  primary: '#5DADE2',
  primaryDark: '#3E8FC4',
  primaryPale: '#AEE1F9',

  textPrimary: '#2B2B2B',
  textSecondary: '#6B6B6B',
  textMuted: '#9B9B9B',
  textOnPrimary: '#FFFFFF',

  success: '#3FA34D',
  warning: '#D9A441',
  danger: '#D9534F',

  white: '#FFFFFF',
};

export const cardFrameGradient: [string, string, string] = [
  colors.primaryPale,
  colors.primary,
  colors.primaryPale,
];

export const calendarTheme = {
  backgroundColor: colors.background,
  calendarBackground: colors.background,
  textSectionTitleColor: colors.textSecondary,
  dayTextColor: colors.textPrimary,
  todayTextColor: colors.primary,
  monthTextColor: colors.textPrimary,
  arrowColor: colors.primary,
  dotColor: colors.primary,
  selectedDotColor: colors.textOnPrimary,
  selectedDayBackgroundColor: colors.primary,
  selectedDayTextColor: colors.textOnPrimary,
  textDisabledColor: colors.textMuted,
  textMonthFontWeight: '700' as const,
  textDayFontSize: 14,
  textMonthFontSize: 16,
};
