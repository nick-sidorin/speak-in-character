import { createTheme } from '@mantine/core';

// Native Mantine palette, sizing and component styles.
// No custom palette or per-component CSS overrides.
export const appTheme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
  fontFamilyMonospace: '"Cascadia Code", Consolas, monospace',
  cursorType: 'pointer',
});
