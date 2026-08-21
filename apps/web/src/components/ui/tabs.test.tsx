import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Tabs, TabsList, TabsTrigger } from './tabs';

describe('Tabs', () => {
  it('keeps horizontal overflow with a thin scrollbar on the tab list', () => {
    const { container } = render(
      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = container.querySelector('[data-slot="tabs-list"]');
    expect(list).toHaveClass('overflow-x-auto');
    expect(list).toHaveClass('thin-scrollbar');
    expect(list).not.toHaveClass('no-scrollbar');
  });
});
