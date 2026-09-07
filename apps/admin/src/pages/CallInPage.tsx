/**
 * AllGO Section 18: Call-In Trip Page
 * 
 * Fast form for dispatchers to create trips from phone calls.
 * Designed for speed - minimum fields, large buttons.
 */

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface TripStatus {
  tripId: string;
  status: string;
  dispatchStatus?: string | null;
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
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);

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

  const stopPolling = () => {
    pollGenerationRef.current += 1;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const resetForm = () => {
    stopPolling();
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
          dispatchStatus: response.data.dispatch?.status || 'SEARCHING',
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
    stopPolling();
    const generation = pollGenerationRef.current;

    const poll = async () => {
      if (generation !== pollGenerationRef.current) return;

      try {
        const response = await axios.get(
          `${API_BASE_URL}/admin/trips/call-in/${tripId}/status`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
            },
          }
        );

        if (generation !== pollGenerationRef.current) return;

        setCreatedTrip((prev) =>
          prev
            ? {
                ...prev,
                status: response.data.status,
                driver: response.data.driver,
                dispatchStatus: response.data.dispatchStatus,
              }
            : null
        );
        setDispatchStatus(response.data.dispatchStatus);

        const lifecycleTerminal = ['COMPLETED', 'CANCELLED'].includes(response.data.status);
        const dispatchTerminal = ['NO_DRIVER_FOUND', 'FAILED'].includes(response.data.dispatchStatus);
        if (!lifecycleTerminal && !dispatchTerminal && generation === pollGenerationRef.current) {
          pollTimeoutRef.current = setTimeout(poll, 3000);
        }
      } catch (error) {
        console.error('Failed to poll trip status:', error);
        if (generation === pollGenerationRef.current) {
          pollTimeoutRef.current = setTimeout(poll, 3000);
        }
      }
    };

    pollTimeoutRef.current = setTimeout(poll, 3000);
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
        <h1 className="text-2xl font-bold text-slate-900">📞 New Call-In Trip</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a trip for a phone caller. Fill quickly — caller is waiting.
        </p>
      </div>

      {/* Trip Created Status */}
      {createdTrip && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            dispatchStatus === 'NO_DRIVER_FOUND' || dispatchStatus === 'FAILED'
              ? 'bg-red-50 border border-red-200'
              : ['ACCEPTED', 'ACTIVE', 'COMPLETED'].includes(createdTrip.status)
              ? 'bg-green-50 border border-green-200'
              : createdTrip.status === 'CANCELLED'
              ? 'bg-red-50 border border-red-200'
              : 'bg-blue-50 border border-blue-200'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lg">
                {dispatchStatus === 'NO_DRIVER_FOUND'
                  ? '❌ No Drivers Available'
                  : dispatchStatus === 'FAILED'
                  ? '⚠️ Dispatch Failed'
                  : createdTrip.status === 'ACCEPTED'
                  ? '✅ Driver Assigned!'
                  : createdTrip.status === 'ACTIVE'
                  ? '🚗 Trip In Progress'
                  : createdTrip.status === 'COMPLETED'
                  ? '✅ Trip Completed'
                  : createdTrip.status === 'CANCELLED'
                  ? '❌ Trip Cancelled'
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
                  {createdTrip.status === 'ACCEPTED' && (
                    <p className="text-sm text-gray-500 mt-2">
                      Tell the caller: "Your driver {createdTrip.driver.name} will call
                      you shortly."
                    </p>
                  )}
                  {createdTrip.status === 'ACTIVE' && (
                    <p className="text-sm text-green-700 mt-2">The trip is currently in progress.</p>
                  )}
                  {createdTrip.status === 'COMPLETED' && (
                    <p className="text-sm text-green-700 mt-2">The trip has been completed.</p>
                  )}
                  {createdTrip.status === 'CANCELLED' && (
                    <p className="text-sm text-red-700 mt-2">The trip was cancelled.</p>
                  )}
                </div>
              ) : dispatchStatus === 'NO_DRIVER_FOUND' ? (
                <p className="mt-2 text-red-700">
                  No riders are available right now. Please try again shortly.
                </p>
              ) : dispatchStatus === 'FAILED' ? (
                <p className="mt-2 text-red-700">
                  Automatic driver dispatch failed. The trip remains requested.
                </p>
              ) : createdTrip.status === 'ACTIVE' ? (
                <p className="mt-2 text-green-700">The trip is currently in progress.</p>
              ) : createdTrip.status === 'COMPLETED' ? (
                <p className="mt-2 text-green-700">The trip has been completed.</p>
              ) : createdTrip.status === 'CANCELLED' ? (
                <p className="mt-2 text-red-700">The trip was cancelled.</p>
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
          <div className="card p-5">
            <h3 className="mb-4 font-semibold text-slate-900">📱 Caller Info</h3>
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
                  className="input py-3 text-lg"
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
                  className="input py-3"
                />
              </div>
            </div>
          </div>

          {/* Locations */}
          <div className="card p-5">
            <h3 className="mb-4 font-semibold text-slate-900">📍 Locations</h3>
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
                  className="input py-3"
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
                  className="input py-3"
                  required
                />
              </div>
            </div>
          </div>

          {/* Vehicle Type */}
          <div className="card p-5">
            <h3 className="mb-4 font-semibold text-slate-900">🚗 Vehicle Type</h3>
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
                  className={`rounded-xl border p-4 text-center transition ${
                    vehicleType === v.type
                      ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="mb-1 block text-2xl">{v.label.split(' ')[0]}</span>
                  <span className="text-sm font-semibold text-slate-800">{v.label.split(' ').slice(1).join(' ')}</span>
                  <span className="block text-xs text-slate-400">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* MOTO: Service Type */}
          {vehicleType === 'MOTO' && (
            <div className="card p-5">
              <h3 className="mb-4 font-semibold text-slate-900">What is this for?</h3>
              <div className="grid grid-cols-2 gap-3">
                {([['PASSENGER', '👤', 'Passenger Ride'], ['DELIVERY', '📦', 'Delivery']] as const).map(([t, icon, label]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setServiceType(t)}
                    className={`rounded-xl border p-4 text-center transition ${
                      serviceType === t
                        ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="mb-1 block text-2xl">{icon}</span>
                    <span className="text-sm font-semibold text-slate-800">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MOTO Delivery: Item Type */}
          {vehicleType === 'MOTO' && serviceType === 'DELIVERY' && (
            <div className="card p-5">
              <h3 className="mb-4 font-semibold text-slate-900">📦 What are they sending?</h3>
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
                    className={`rounded-xl border p-3 text-sm font-medium transition ${
                      deliveryType === d.type
                        ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200 text-slate-800'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
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
                    className="input py-3"
                    required={deliveryType === 'OTHER'}
                  />
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="card p-5">
            <h3 className="mb-4 font-semibold text-slate-900">📝 Notes (optional)</h3>
            <input
              type="text"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="e.g., Wearing red shirt, near the big tree"
              className="input py-3"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn w-full bg-primary-600 py-4 text-lg text-white shadow-sm shadow-orange-500/25 hover:bg-primary-700"
          >
            {isSubmitting ? '⏳ Creating Trip…' : '📞 Create Trip'}
          </button>
        </form>
      )}
    </div>
  );
}
