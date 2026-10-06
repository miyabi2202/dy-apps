import { render, screen } from '@testing-library/react';
import { Column, Grid, Page, Row } from '..';

describe('layout components', () => {
  it.each([
    ['Row', Row],
    ['Column', Column],
    ['Grid', Grid],
    ['Page', Page],
  ])('%s renders a div with its children and passes props through', (_, Component) => {
    render(
      <Component data-testid="box" aria-label="区域">
        <span>内容</span>
      </Component>,
    );
    const box = screen.getByTestId('box');
    expect(box.tagName).toBe('DIV');
    expect(box).toHaveAttribute('aria-label', '区域');
    expect(box).toHaveTextContent('内容');
  });
});
