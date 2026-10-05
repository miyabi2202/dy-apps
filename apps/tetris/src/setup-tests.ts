import '@testing-library/jest-dom';

// jsdom has no canvas; rendering code treats a null context as "skip drawing".
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;
