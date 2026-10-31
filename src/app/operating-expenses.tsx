import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';

type Expense = {
  id: number;
  description: string;
  category: string;
  payee: string | null;
  amount_paise: number;
  payment_status: 'PENDING' | 'PAID';
  payment_method: string | null;
  expense_date: string;
  payment_date: string | null;
  transaction_reference: string | null;
  notes: string | null;
};

const CATEGORIES = [
  'RENT',
  'SALARY',
  'ELECTRICITY',
  'INTERNET',
  'TRAVEL',
  'OFFICE',
  'MARKETING',
  'OTHER',
];

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
];

const colors = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  primary: '#176B55',
  primaryLight: '#E5F4EE',
  text: '#172B27',
  muted: '#6B7B76',
  border: '#E0E8E4',
  danger: '#B42318',
  dangerLight: '#FDECEC',
  blue: '#245BC7',
  blueLight: '#EAF1FF',
};

function money(paise: number) {
  return (paise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
}

function readable(value: string) {
  return value.replaceAll('_', ' ').toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(value: string | null) {
  if (!value) return 'Not set';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function OperatingExpensesScreen() {
  const db = useSQLiteContext();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'PENDING' | 'PAID'>('PENDING');
  const [method, setMethod] = useState('CASH');
  const [expenseDate, setExpenseDate] = useState(today());
  const [paymentDate, setPaymentDate] = useState(today());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const loadExpenses = useCallback(async () => {
    try {
      const rows = await db.getAllAsync<Expense>(
        `SELECT *
         FROM operating_expenses
         ORDER BY expense_date DESC, id DESC`,
      );
      setExpenses(rows);
    } catch (error) {
      console.error('Failed to load operating expenses:', error);
      Alert.alert('Error', 'Could not load operating expenses.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadExpenses();
    }, [loadExpenses]),
  );

  const paidTotal = expenses
    .filter((item) => item.payment_status === 'PAID')
    .reduce((sum, item) => sum + item.amount_paise, 0);

  const pendingTotal = expenses
    .filter((item) => item.payment_status === 'PENDING')
    .reduce((sum, item) => sum + item.amount_paise, 0);

  const filteredExpenses = expenses.filter((item) => {
    const matchesStatus =
      filter === 'ALL' || item.payment_status === filter;

    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      item.description.toLowerCase().includes(term) ||
      (item.payee ?? '').toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term) ||
      (item.transaction_reference ?? '').toLowerCase().includes(term);

    return matchesStatus && matchesSearch;
  });

  function resetForm() {
    setEditingId(null);
    setDescription('');
    setCategory('OTHER');
    setPayee('');
    setAmount('');
    setStatus('PENDING');
    setMethod('CASH');
    setExpenseDate(today());
    setPaymentDate(today());
    setReference('');
    setNotes('');
  }

  function openAddForm() {
    resetForm();
    setModalVisible(true);
  }

  function openEditForm(item: Expense) {
    setEditingId(item.id);
    setDescription(item.description);
    setCategory(item.category);
    setPayee(item.payee ?? '');
    setAmount((item.amount_paise / 100).toFixed(2));
    setStatus(item.payment_status);
    setMethod(item.payment_method ?? 'CASH');
    setExpenseDate(item.expense_date.slice(0, 10));
    setPaymentDate(item.payment_date?.slice(0, 10) ?? today());
    setReference(item.transaction_reference ?? '');
    setNotes(item.notes ?? '');
    setModalVisible(true);
  }

  async function saveExpense() {
    if (!description.trim()) {
      Alert.alert('Required', 'Please enter an expense description.');
      return;
    }

    const parsedAmount = Number(amount.trim().replace(/,/g, ''));

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than ₹0.');
      return;
    }

    const amountPaise = Math.round(parsedAmount * 100);

    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount in rupees.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      Alert.alert('Invalid date', 'Use the date format YYYY-MM-DD.');
      return;
    }

    if (
      status === 'PAID' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
    ) {
      Alert.alert('Invalid payment date', 'Use YYYY-MM-DD.');
      return;
    }

    setSaving(true);

    try {
      const finalPaymentDate = status === 'PAID' ? paymentDate : null;
      const finalMethod = status === 'PAID' ? method : null;

      if (editingId !== null) {
        await db.runAsync(
          `UPDATE operating_expenses
           SET description = ?,
               category = ?,
               payee = ?,
               amount_paise = ?,
               payment_status = ?,
               payment_method = ?,
               expense_date = ?,
               payment_date = ?,
               transaction_reference = ?,
               notes = ?,
               updated_at = ?
           WHERE id = ?`,
          description.trim(),
          category,
          payee.trim() || null,
          amountPaise,
          status,
          finalMethod,
          expenseDate,
          finalPaymentDate,
          reference.trim() || null,
          notes.trim() || null,
          new Date().toISOString(),
          editingId,
        );
      } else {
        await db.runAsync(
          `INSERT INTO operating_expenses (
             description,
             category,
             payee,
             amount_paise,
             payment_status,
             payment_method,
             expense_date,
             payment_date,
             transaction_reference,
             notes
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          description.trim(),
          category,
          payee.trim() || null,
          amountPaise,
          status,
          finalMethod,
          expenseDate,
          finalPaymentDate,
          reference.trim() || null,
          notes.trim() || null,
        );
      }

      setModalVisible(false);
      resetForm();
      await loadExpenses();

      Alert.alert(
        'Saved',
        editingId !== null
          ? 'Expense updated successfully.'
          : 'Expense added successfully.',
      );
    } catch (error) {
      console.error('Failed to save expense:', error);
      Alert.alert('Save failed', 'Could not save this expense.');
    } finally {
      setSaving(false);
    }
  }

  function deleteExpense(id: number) {
    Alert.alert(
      'Delete expense',
      'Are you sure you want to delete this expense?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await db.runAsync(
                  'DELETE FROM operating_expenses WHERE id = ?',
                  id,
                );
                await loadExpenses();
              } catch (error) {
                console.error('Failed to delete expense:', error);
                Alert.alert('Error', 'Could not delete this expense.');
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerButtons}>
          <Pressable
            onPress={() => router.replace('/')}
            style={styles.homeButton}
          >
            <Ionicons name="home" size={22} color="#2563eb" />
          </Pressable>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        </View>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.brand}>TICKET DESK</Text>
          <Text style={styles.headerSubtitle}>Operating Expenses · Offline</Text>
        </View>

        <View style={styles.localBadge}>
          <View style={styles.localDot} />
          <Text style={styles.localText}>LOCAL</Text>
        </View>
      </View>

      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>Operating Expenses</Text>
            <Text style={styles.subtitle}>
              Manage rent, salaries, bills and other business expenses.
            </Text>
          </View>
          <Pressable style={styles.addButton} onPress={openAddForm}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </Pressable>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>PAID EXPENSES</Text>
            <Text style={styles.paidValue}>{money(paidTotal)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>PENDING</Text>
            <Text style={styles.pendingValue}>{money(pendingTotal)}</Text>
          </View>
        </View>

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search description, payee or category..."
          placeholderTextColor={colors.muted}
        />

        <View style={styles.filterRow}>
          {(['ALL', 'PAID', 'PENDING'] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[
                styles.filterButton,
                filter === item && styles.filterButtonSelected,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item && styles.filterTextSelected,
                ]}
              >
                {item === 'ALL' ? 'All' : readable(item)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Expense history</Text>
          <Text style={styles.sectionSubtitle}>
            {filteredExpenses.length} record(s)
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 30 }}
          />
        ) : filteredExpenses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No expenses found</Text>
            <Text style={styles.emptyText}>
              Add your first operating expense using the Add button.
            </Text>
          </View>
        ) : (
          filteredExpenses.map((item) => (
            <View key={item.id} style={styles.expenseCard}>
              <View style={styles.expenseTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseTitle}>{item.description}</Text>
                  <Text style={styles.expenseMeta}>
                    {readable(item.category)}
                    {item.payee ? ` · ${item.payee}` : ''}
                  </Text>
                  <Text style={styles.expenseMeta}>
                    Expense date: {displayDate(item.expense_date)}
                  </Text>
                  {item.payment_status === 'PAID' ? (
                    <Text style={styles.expenseMeta}>
                      Paid on: {displayDate(item.payment_date)}
                      {item.payment_method
                        ? ` · ${readable(item.payment_method)}`
                        : ''}
                    </Text>
                  ) : null}
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.expenseAmount}>
                    {money(item.amount_paise)}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      item.payment_status === 'PAID'
                        ? styles.paidBadge
                        : styles.pendingBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        item.payment_status === 'PAID'
                          ? styles.paidText
                          : styles.pendingText,
                      ]}
                    >
                      {readable(item.payment_status)}
                    </Text>
                  </View>
                </View>
              </View>

              {item.transaction_reference ? (
                <Text style={styles.expenseNote}>
                  Ref: {item.transaction_reference}
                </Text>
              ) : null}

              {item.notes ? (
                <Text style={styles.expenseNote}>{item.notes}</Text>
              ) : null}

              <View style={styles.actionRow}>
                <Pressable
                  style={styles.editButton}
                  onPress={() => openEditForm(item)}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => deleteExpense(item.id)}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Text style={styles.footer}>
          Only paid operating expenses are included in Total Expenses.
        </Text>
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId !== null ? 'Edit expense' : 'Add expense'}
              </Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              <Text style={styles.fieldLabel}>Description *</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Office rent"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.fieldLabel}>Category *</Text>
              <View style={styles.optionWrap}>
                {CATEGORIES.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setCategory(item)}
                    style={[
                      styles.option,
                      category === item && styles.optionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        category === item && styles.optionTextSelected,
                      ]}
                    >
                      {readable(item)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Payee / Paid to</Text>
              <TextInput
                style={styles.input}
                value={payee}
                onChangeText={setPayee}
                placeholder="Person or company name"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.fieldLabel}>Amount (₹) *</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="e.g. 2500.00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />

              <Text style={styles.fieldLabel}>Expense date (YYYY-MM-DD) *</Text>
              <TextInput
                style={styles.input}
                value={expenseDate}
                onChangeText={setExpenseDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.fieldLabel}>Payment status *</Text>
              <View style={styles.optionWrap}>
                {(['PENDING', 'PAID'] as const).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setStatus(item)}
                    style={[
                      styles.option,
                      status === item && styles.optionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        status === item && styles.optionTextSelected,
                      ]}
                    >
                      {readable(item)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {status === 'PAID' ? (
                <>
                  <Text style={styles.fieldLabel}>Payment method *</Text>
                  <View style={styles.optionWrap}>
                    {METHODS.map((item) => (
                      <Pressable
                        key={item.value}
                        onPress={() => setMethod(item.value)}
                        style={[
                          styles.option,
                          method === item.value && styles.optionSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            method === item.value && styles.optionTextSelected,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>
                    Payment date (YYYY-MM-DD) *
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={paymentDate}
                    onChangeText={setPaymentDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                  />

                  <Text style={styles.fieldLabel}>Transaction reference</Text>
                  <TextInput
                    style={styles.input}
                    value={reference}
                    onChangeText={setReference}
                    placeholder="UPI or bank reference (optional)"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="characters"
                  />
                </>
              ) : null}

              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes"
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
              />

              <Pressable
                style={[
                  styles.primaryButton,
                  saving && styles.disabledButton,
                ]}
                onPress={() => void saveExpense()}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? 'Saving...' : 'Save expense'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: { paddingVertical: 8, paddingRight: 4 },
  backButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  headerTitleWrap: { flex: 1 },
  brand: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  headerSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  localBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },
  localDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  localText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  page: { flex: 1 },
  pageContent: { padding: 18, paddingBottom: 36 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '800', marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 11,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  summaryLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  paidValue: { color: colors.primary, fontSize: 17, fontWeight: '800', marginTop: 7 },
  pendingValue: { color: colors.danger, fontSize: 17, fontWeight: '800', marginTop: 7 },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    padding: 12,
    color: colors.text,
    fontSize: 14,
  },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 22 },
  filterButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  filterButtonSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  filterTextSelected: { color: colors.primary },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  expenseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  expenseTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  expenseTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  expenseMeta: { color: colors.muted, fontSize: 11, marginTop: 5 },
  expenseAmount: { color: colors.text, fontSize: 15, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, marginTop: 7 },
  paidBadge: { backgroundColor: colors.primaryLight },
  pendingBadge: { backgroundColor: colors.dangerLight },
  statusText: { fontSize: 10, fontWeight: '800' },
  paidText: { color: colors.primary },
  pendingText: { color: colors.danger },
  expenseNote: { color: colors.muted, fontSize: 12, marginTop: 8 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 12,
    paddingTop: 10,
  },
  editButton: { backgroundColor: colors.blueLight, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 9 },
  editButtonText: { color: colors.blue, fontSize: 12, fontWeight: '800' },
  deleteButton: { backgroundColor: colors.dangerLight, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 9 },
  deleteButtonText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  footer: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 22 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  closeButton: { color: colors.muted, fontSize: 20, padding: 5 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 14 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10 },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  optionTextSelected: { color: colors.primary, fontWeight: '800' },
  multilineInput: { minHeight: 82, textAlignVertical: 'top' },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.6 },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },

  homeButton: {
    padding: 6,
  },
  back: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '600',
  },
});
