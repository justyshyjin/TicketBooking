import React, { createElement } from 'react';
import {
  Platform,
  TextInput,
  StyleSheet,
  View,
  Pressable,
  Text,
} from 'react-native';

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
};

export function DateField({
  value,
  onChange,
  placeholder = 'Select date',
  allowClear = false,
}: DateFieldProps) {
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date',
      value: value ? value.slice(0, 10) : '',
      onChange: (event: any) => onChange(event.target.value),
      'aria-label': placeholder,
      style: {
        width: '100%',
        minWidth: 0,
        height: 46,
        boxSizing: 'border-box',
        padding: '10px 12px',
        border: '1px solid #D0D5DD',
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
        color: '#222222',
        fontSize: 16,
      },
    });
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        autoCapitalize="none"
      />
      {allowClear && value ? (
        <Pressable onPress={() => onChange('')} style={styles.clear}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 16,
  },
  clear: {
    position: 'absolute',
    right: 10,
    top: 13,
  },
  clearText: {
    color: '#2563EB',
    fontSize: 13,
  },
});
