/**
 * AllGO Section 18: Call-In Trip Page
 * 
 * Fast form for dispatchers to create trips from phone calls.
 * Designed for speed - minimum fields, large buttons.
 */

import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface TripStatus {
  tripId: string;
  status: string;
  driver: {
    name: string;
    phone: string;
  } | null;
}

type VehicleType = 'MOTO' | 'KEKE' | 'MOTOR_KING';
type ServiceType = 'PASSENGER' | 'DELIVERY';
type DeliveryType = 'FOOD' | 'GROCERIES' | 'PARCELS' | 'OTHER';

export function CallInPage() {
  // Form state
  const [callerPhone, setCallerPhone] = useState('');
  const [callerName, setCallerName] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('MOTO');
  const [serviceType, setServiceType] = useState<ServiceType>('PASSENGER');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('FOOD');
  const [itemDescription, setItemDescription] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  // Status state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTrip, setCreatedTrip] = useState<TripStatus | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [isCallInHours, setIsCallInHours] = useState(true);

  // Check if call-in is available
  useEffect(() => {
    checkCallInHours();
    const interval = setInterval(checkCallInHours, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const checkCallInHours = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/stats`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
        },
      });
      setIsCallInHours(response.data.service?.isCallInHours ?? true);
    } catch (error) {
      console.error('Failed to check call-in hours:', error);
    }
  };

  const resetForm = () => {
    setCallerPhone('');
    setCallerName('');
    setPickupAddress('');
    setDestinationAddress('');
    setVehicleType('MOTO');
    setServiceType('PASSENGER');
    setDeliveryType('FOOD');
    setItemDescription('');
    setCustomerNote('');
    setCreatedTrip(null);
    setDispatchStatus(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        callerPhone,
        callerName: callerName || undefined,
        vehicleType,
        serviceType: vehicleType === 'MOTO' ? serviceType : 'PASSENGER',
        deliveryType: vehicleType === 'MOTO' && serviceType === 'DELIVERY' ? deliveryType : undefined,
        itemDescription: deliveryType === 'OTHER' ? itemDescription : undefined,
        pickup: { address: pickupAddress },
        destination: { address: destinationAddress },
        customerNote: customerNote || undefined,
      };

      const response = await axios.post(
        `${API_BASE_URL}/admin/trips/call-in`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setCreatedTrip({
        tripId: response.data.trip.id,
        status: response.data.trip.status,
        driver: response.data.dispatch?.nearestDriver
          ? {
              name: response.data.dispatch.nearestDriver.driverName,
              phone: response.data.dispatch.nearestDriver.driverPhone,
            }
          : null,
      });
      setDispatchStatus(response.data.dispatch?.status || 'SEARCHING');

      // Poll for status updates
      if (response.data.trip.id) {
        pollTripStatus(response.data.trip.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create trip');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pollTripStatus = async (tripId: string) => {
    const maxAttempts = 10;
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) return;
      attempts++;

      try {
        const response = await axios.get(
          `${API_BASE_URL}/admin/trips/call-in/${tripId}/status`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
            },
          }
        );

        setCreatedTrip((prev) =>
          prev
            ? {
                ...prev,
                status: response.data.status,
                driver: response.data.driver,
              }
            : null
        );

        // Continue polling if not completed/cancelled
        if (!['COMPLETED', 'CANCELLED'].includes(response.data.status)) {
          setTimeout(poll, 3000);
        }
      } catch (error) {
        console.error('Failed to poll trip status:', error);
      }
    };

    setTimeout(poll, 3000);
  };

  // Show out-of-hours message
  if (!isCallInHours) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-3xl">🌙</span>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-yellow-800">
                Call-In Booking Unavailable
              </h3>
              <p className="mt-2 text-yellow-700">
                Call-in booking is available <strong>7am - 9pm</strong> only.
              </p>
              <p className="mt-1 text-yellow-700">
                For late-night rides, please ask the customer to use the AllGo app.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📞 New Call-In Trip</h1>
        <p className="text-gray-600 mt-1">
          Create a trip for a phone caller. Fill quickly — caller is waiting.
        </p>
      </div>

      {/* Trip Created Status */}
      {createdTrip && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            dispatchStatus === 'NO_DRIVER_FOUND'
              ? 'bg-red-50 border border-red-200'
              : createdTrip.status === 'ACCEPTED'
              ? 'bg-green-50 border border-green-200'
              : 'bg-blue-50 border border-blue-200'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lg">
                {dispatchStatus === 'NO_DRIVER_FOUND'
                  ? '❌ No Drivers Available'
                  : createdTrip.status === 'ACCEPTED'
                  ? '✅ Driver Assigned!'
                  : '🔍 Searching for Driver...'}
              </h3>

              {createdTrip.driver ? (
                <div className="mt-2">
                  <p className="text-gray-700">
                    <strong>Driver:</strong> {createdTrip.driver.name}
                  </p>
                  <p className="text-gray-700">
                    <strong>Phone:</strong>{' '}
                    <a
                      href={`tel:${createdTrip.driver.phone}`}
                      className="text-primary-600 underline"
                    >
                      {createdTrip.driver.phone}
                    </a>
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Tell the caller: "Your driver {createdTrip.driver.name} will call
                    you shortly."
                  </p>
                </div>
              ) : dispatchStatus === 'NO_DRIVER_FOUND' ? (
                <p className="mt-2 text-red-700">
                  Tell the caller: "No riders are available right now. We will call
                  you back as soon as one is available."
                </p>
              ) : (
                <p className="mt-2 text-gray-600">Looking for the nearest driver...</p>
              )}
            </div>

            <span className="text-xs text-gray-500">
              Trip #{createdTrip.tripId.slice(0, 8)}
            </span>
          </div>

          <button
            onClick={resetForm}
            className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Create Another Trip
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Call-In Form */}
      {!createdTrip && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Caller Info */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-semibold text-gray-900 mb-3">📱 Caller Info</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={callerPhone}
                  onChange={(e) => setCallerPhone(e.target.value)}
                  placeholder="0XX XXX XXXX"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={callerName}
                  onChange={(e) => setCallerName(e.target.value)}
                  placeholder="Caller's name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Locations */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-semibold text-gray-900 mb-3">📍 Locations</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pickup Location *
                </label>
                <input
                  type="text"
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="e.g., Near the market, behind Total filling station"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destination *
                </label>
                <input
                  type="text"
                  value={destinationAddress}
                  onChange={(e) => setDestinationAddress(e.target.value)}
                  placeholder="e.g., Tema Station, near the lorry park"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
          </div>

          {/* Vehicle Type */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-semibold text-gray-900 mb-3">🚗 Vehicle Type</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { type: 'MOTO', label: '🏍️ Moto', desc: '1 person' },
                { type: 'KEKE', label: '🛺 Keke / Pragya', desc: '1-3 people' },
                { type: 'MOTOR_KING', label: '🛻 Aboboya', desc: 'Cargo' },
              ].map((v) => (
                <button
                  key={v.type}
                  type="button"
                  onClick={() => setVehicleType(v.type as VehicleType)}
                  className={`p-4 rounded-lg border-2 transition-all text-center ${
                    vehicleType === v.type
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl block mb-1">{v.label.split(' ')[0]}</span>
                  <span className="font-medium">{v.label.split(' ').slice(1).join(' ')}</span>
                  <span className="text-xs text-gray-500 block">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* MOTO: Service Type */}
          {vehicleType === 'MOTO' && (
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-semibold text-gray-900 mb-3">What is this for?</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setServiceType('PASSENGER')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    serviceType === 'PASSENGER'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl block mb-1">👤</span>
                  <span className="font-medium">Passenger Ride</span>
                </button>
                <button
                  type="button"
                  onClick={() => setServiceType('DELIVERY')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    serviceType === 'DELIVERY'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl block mb-1">📦</span>
                  <span className="font-medium">Delivery</span>
                </button>
              </div>
            </div>
          )}

          {/* MOTO Delivery: Item Type */}
          {vehicleType === 'MOTO' && serviceType === 'DELIVERY' && (
            <div className="bg-white rounded-xl shadow p-4">
              <h3 className="font-semibold text-gray-900 mb-3">📦 What are they sending?</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { type: 'FOOD', label: '🍲 Food' },
                  { type: 'GROCERIES', label: '🛒 Groceries' },
                  { type: 'PARCELS', label: '📦 Parcels' },
                  { type: 'OTHER', label: '📝 Other' },
                ].map((d) => (
                  <button
                    key={d.type}
                    type="button"
                    onClick={() => setDeliveryType(d.type as DeliveryType)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      deliveryType === d.type
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {deliveryType === 'OTHER' && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    placeholder="Describe the item..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required={deliveryType === 'OTHER'}
                  />
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-semibold text-gray-900 mb-3">📝 Notes (optional)</h3>
            <input
              type="text"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="e.g., Wearing red shirt, near the big tree"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-5 rounded-xl text-white font-bold text-xl transition-all ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 active:scale-98'
            }`}
          >
            {isSubmitting ? '⏳ Creating Trip...' : '📞 Create Trip'}
          </button>
        </form>
      )}
    </div>
  );
}
