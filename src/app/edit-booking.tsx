
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

type BookingForm = {
    transport_type: string;
    operator_name: string;
    booking_reference: string;
    origin: string;
    destination: string;
    journey_at: string;
    return_at: string;
    selling_price: string;
    supplier_cost: string;
    notes: string;
};

const emptyForm: BookingForm = {
    transport_type: 'BUS',
    operator_name: '',
    booking_reference: '',
    origin: '',
    destination: '',
    journey_at: '',
    return_at: '',
    selling_price: '0',
    supplier_cost: '0',
    notes: '',
};

const toPaise = (value: string) => Math.round(Number(value) * 100);

export default function EditBookingScreen() {
    const db = useSQLiteContext();
    const { id } = useLocalSearchParams<{ id: string }>();

    const [form, setForm] = useState<BookingForm>(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notFound, setNotFound] = useState(false);

    const updateField = (field: keyof BookingForm, value: string) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const loadBooking = useCallback(async () => {
        setLoading(true);

        try {
            const bookingId = Number(id);

            if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
                setNotFound(true);
                return;
            }

            const booking = await db.getFirstAsync<{
                transport_type: string;
                operator_name: string | null;
                booking_reference: string | null;
                origin: string | null;
                destination: string | null;
                journey_at: string | null;
                return_at: string | null;
                selling_price_paise: number;
                supplier_cost_paise: number;
                notes: string | null;
            }>(
                `SELECT transport_type, operator_name, booking_reference,
          origin, destination, journey_at, return_at,
          selling_price_paise, supplier_cost_paise, notes
         FROM bookings WHERE id = ?`,
                bookingId,
            );

            if (!booking) {
                setNotFound(true);
                return;
            }

            setNotFound(false);
            setForm({
                transport_type: booking.transport_type,
                operator_name: booking.operator_name ?? '',
                booking_reference: booking.booking_reference ?? '',
                origin: booking.origin ?? '',
                destination: booking.destination ?? '',
                journey_at: booking.journey_at ?? '',
                return_at: booking.return_at ?? '',
                selling_price: (booking.selling_price_paise / 100).toFixed(2),
                supplier_cost: (booking.supplier_cost_paise / 100).toFixed(2),
                notes: booking.notes ?? '',
            });
        } catch (error) {
            console.error('Failed to load booking:', error);
            Alert.alert('Error', 'Could not load booking details.');
        } finally {
            setLoading(false);
        }
    }, [db, id]);

    useFocusEffect(
        useCallback(() => {
            void loadBooking();
        }, [loadBooking]),
    );

    const saveChanges = async () => {
        const selling = Number(form.selling_price);
        const cost = Number(form.supplier_cost);

        if (!form.origin.trim() || !form.destination.trim()) {
            Alert.alert('Missing details', 'Enter both origin and destination.');
            return;
        }

        if (!form.journey_at.trim()) {
            Alert.alert('Missing date', 'Enter the journey date.');
            return;
        }

        if (
            !Number.isFinite(selling) ||
            !Number.isFinite(cost) ||
            selling < 0 ||
            cost < 0 ||
            !Number.isSafeInteger(toPaise(form.selling_price)) ||
            !Number.isSafeInteger(toPaise(form.supplier_cost))
        ) {
            Alert.alert('Invalid price', 'Enter valid non-negative prices with no more than two decimal places.');
            return;
        }

        setSaving(true);

        try {
            await db.runAsync(
                `UPDATE bookings SET
          transport_type = ?,
          operator_name = ?,
          booking_reference = ?,
          origin = ?,
          destination = ?,
          journey_at = ?,
          return_at = ?,
          selling_price_paise = ?,
          supplier_cost_paise = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
                form.transport_type,
                form.operator_name.trim() || null,
                form.booking_reference.trim() || null,
                form.origin.trim(),
                form.destination.trim(),
                form.journey_at.trim(),
                form.return_at.trim() || null,
                toPaise(form.selling_price),
                toPaise(form.supplier_cost),
                form.notes.trim() || null,
                Number(id),
            );

            Alert.alert('Saved', 'Booking details updated successfully.', [
                {
                    text: 'OK',
                    onPress: () => router.back(),
                },
            ]);
        } catch (error) {
            console.error('Failed to update booking:', error);
            Alert.alert('Error', 'Could not update the booking.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.center}>
                <ActivityIndicator size="large" color="#176B55" />
                <Text style={styles.muted}>Loading booking...</Text>
            </SafeAreaView>
        );
    }

    if (notFound) {
        return (
            <SafeAreaView style={styles.center}>
                <Text style={styles.title}>Booking not found</Text>
                <Pressable style={styles.button} onPress={() => router.back()}>
                    <Text style={styles.buttonText}>Go Back</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    const fields: {
        key: keyof BookingForm;
        label: string;
        placeholder: string;
        keyboard?: 'default' | 'decimal-pad';
        multiline?: boolean;
    }[] = [
            { key: 'operator_name', label: 'Operator', placeholder: 'e.g. Airline or bus operator' },
            { key: 'booking_reference', label: 'Booking reference', placeholder: 'Enter reference' },
            { key: 'origin', label: 'Origin *', placeholder: 'Departure location' },
            { key: 'destination', label: 'Destination *', placeholder: 'Arrival location' },
            { key: 'journey_at', label: 'Journey date *', placeholder: 'YYYY-MM-DD' },
            { key: 'return_at', label: 'Return date', placeholder: 'YYYY-MM-DD (optional)' },
            { key: 'selling_price', label: 'Selling price (₹)', placeholder: '0.00', keyboard: 'decimal-pad' },
            { key: 'supplier_cost', label: 'Supplier cost (₹)', placeholder: '0.00', keyboard: 'decimal-pad' },
            { key: 'notes', label: 'Notes', placeholder: 'Additional details', multiline: true },
        ];

    return (
        <SafeAreaView style={styles.screen}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Pressable style={styles.backButton} onPress={() => router.back()}>
                    <Text style={styles.backText}>‹ Back</Text>
                </Pressable>

                <Text style={styles.eyebrow}>BOOKING MANAGEMENT</Text>
                <Text style={styles.title}>Edit Booking</Text>
                <Text style={styles.muted}>Update the details and save your changes.</Text>

                <View style={styles.card}>
                    <Text style={styles.label}>Transport type</Text>
                    <View style={styles.typeRow}>
                        {(['BUS', 'TRAIN', 'FLIGHT', 'OTHER'] as const).map((type) => (
                            <Pressable
                                key={type}
                                style={[
                                    styles.typeButton,
                                    form.transport_type === type && styles.typeButtonActive,
                                ]}
                                onPress={() => updateField('transport_type', type)}
                            >
                                <Text
                                    style={[
                                        styles.typeText,
                                        form.transport_type === type && styles.typeTextActive,
                                    ]}
                                >
                                    {type}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    {fields.map((field) => (
                        <View key={field.key}>
                            <Text style={styles.label}>{field.label}</Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    field.multiline && styles.multiline,
                                ]}
                                value={form[field.key]}
                                onChangeText={(value) => updateField(field.key, value)}
                                placeholder={field.placeholder}
                                placeholderTextColor="#8A94A6"
                                keyboardType={field.keyboard ?? 'default'}
                                multiline={field.multiline ?? false}
                                autoCapitalize="none"
                            />
                        </View>
                    ))}

                    <Pressable
                        style={[styles.button, saving && styles.disabled]}
                        onPress={() => void saveChanges()}
                        disabled={saving}
                    >
                        <Text style={styles.buttonText}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Text>
                    </Pressable>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#F5F7FA' },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F5F7FA',
        padding: 24,
        gap: 12,
    },
    content: { padding: 20, paddingBottom: 40 },
    backButton: { marginBottom: 20 },
    backText: { color: '#176B55', fontSize: 15, fontWeight: '600' },
    eyebrow: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.5,
        color: '#176B55',
        marginBottom: 6,
    },
    title: { fontSize: 26, fontWeight: '800', color: '#172B4D', marginBottom: 8 },
    muted: { fontSize: 13, color: '#667085', marginBottom: 12 },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        marginTop: 16,
        gap: 4,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#475467',
        marginTop: 12,
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderColor: '#D9E0E8',
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 11,
        fontSize: 15,
        color: '#172B4D',
    },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeButton: {
        borderWidth: 1,
        borderColor: '#D9E0E8',
        borderRadius: 20,
        paddingVertical: 9,
        paddingHorizontal: 12,
    },
    typeButtonActive: { backgroundColor: '#176B55', borderColor: '#176B55' },
    typeText: { fontSize: 12, fontWeight: '600', color: '#475467' },
    typeTextActive: { color: '#FFFFFF' },
    button: {
        backgroundColor: '#176B55',
        padding: 14,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 22,
    },
    buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    disabled: { opacity: 0.6 },
});
