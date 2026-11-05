export const MAX_VIEWS = 4;
export const modelOptions = [
  { id: 'xmax-2.1', provider: 'xmax', remote: 'x2.1', label: 'Xmax X2.1' },
  { id: 'xmax-2.0', provider: 'xmax', remote: 'x2.0', label: 'Xmax X2.0' },
  { id: 'decart-vton-3.6', provider: 'decart', remote: 'lucy-vton-3.6', label: 'Decart VTON 3.6' },
  { id: 'decart-vton-3.5', provider: 'decart', remote: 'lucy-vton-3.5', label: 'Decart VTON 3.5' },
  { id: 'decart-2.6', provider: 'decart', remote: 'lucy-2.6', label: 'Decart Lucy 2.6' },
  { id: 'decart-2.5', provider: 'decart', remote: 'lucy-2.5', label: 'Decart Lucy 2.5' },
];
export const modelFor = id => modelOptions.find(model => model.id === id);
