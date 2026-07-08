import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Screen } from './screen';

describe('Screen header slot', () => {
  it('renders a passed header above the content', async () => {
    await render(
      <Screen header={<Text>BRAND</Text>}>
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.getByText('BRAND')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('renders nothing extra when no header is passed', async () => {
    await render(
      <Screen>
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.getByText('body')).toBeTruthy();
    expect(screen.queryByText('BRAND')).toBeNull();
  });
});
