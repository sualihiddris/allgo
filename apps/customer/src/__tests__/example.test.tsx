import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';

// Simple example component for testing
const WelcomeScreen = ({ userName }: { userName: string }) => (
  <View>
    <Text>Welcome to AllGo</Text>
    <Text>Hello, {userName}!</Text>
  </View>
);

describe('Example Component Test', () => {
  it('should render welcome message', () => {
    render(<WelcomeScreen userName="John" />);
    
    expect(screen.getByText('Welcome to AllGo')).toBeTruthy();
  });

  it('should display user name', () => {
    render(<WelcomeScreen userName="Sarah" />);
    
    expect(screen.getByText('Hello, Sarah!')).toBeTruthy();
  });

  it('should render correctly with different props', () => {
    const { rerender } = render(<WelcomeScreen userName="Alice" />);
    expect(screen.getByText('Hello, Alice!')).toBeTruthy();
    
    rerender(<WelcomeScreen userName="Bob" />);
    expect(screen.getByText('Hello, Bob!')).toBeTruthy();
  });
});
