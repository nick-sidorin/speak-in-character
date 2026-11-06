import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Ash-inspired, independent from Discord assets or design tokens.
const iris: MantineColorsTuple = [
  '#f0f1ff','#e2e4ff','#c5c9ff','#a5aafc','#8990f7',
  '#7686ed','#6374d9','#5260bd','#434e99','#343d76',
];

export const appTheme = createTheme({
  primaryColor: 'iris',
  primaryShade: { light: 6, dark: 5 },
  colors: { iris },
  fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
  fontFamilyMonospace: '"Cascadia Code", Consolas, monospace',
  defaultRadius: 'md',
  focusRing: 'auto',
  cursorType: 'pointer',
  components: {
    Button: { defaultProps: { radius: 'md', size: 'sm' } },
    TextInput: { defaultProps: { radius: 'md', size: 'sm' } },
    PasswordInput: { defaultProps: { radius: 'md', size: 'sm' } },
    Textarea: { defaultProps: { radius: 'md', size: 'sm' } },
    Select: { defaultProps: { radius: 'md', size: 'sm' } },
    ActionIcon: { defaultProps: { radius: 'md', size: 'md' } },
  },
});
