import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GoogleGeocodeResponse = {
  status: string;
  results?: Array<{ address_components?: GoogleAddressComponent[] }>;
};

function component(components: GoogleAddressComponent[], type: string) {
  return components.find((item) => item.types.includes(type));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ message: 'Account service is not configured.' }, { status: 503 });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ message: 'Sign in to use location lookup.' }, { status: 401 });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ message: 'Location lookup is not configured yet. Enter your location manually.' }, { status: 503 });

  const body = await request.json().catch(() => null);
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ message: 'A valid location is required.' }, { status: 400 });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${latitude},${longitude}`);
  url.searchParams.set('region', 'us');
  url.searchParams.set('key', apiKey);

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ message: 'Google Maps could not look up this location. Enter it manually.' }, { status: 502 });
    }

    const result = await response.json() as GoogleGeocodeResponse;
    if (result.status === 'ZERO_RESULTS') {
      return NextResponse.json({ message: 'We could not find an address here. Enter your location manually.' }, { status: 404 });
    }
    if (result.status !== 'OK' || !result.results?.length) {
      return NextResponse.json({ message: 'Location lookup is temporarily unavailable. Enter your location manually.' }, { status: 502 });
    }

    const components = result.results.flatMap((item) => item.address_components ?? []);
    const city = component(components, 'locality')
      ?? component(components, 'postal_town')
      ?? component(components, 'sublocality_level_1');
    const state = component(components, 'administrative_area_level_1');
    const postalCode = component(components, 'postal_code');

    return NextResponse.json({
      city: city?.long_name ?? '',
      state: state?.short_name ?? '',
      postalCode: postalCode?.long_name ?? '',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ message: 'Location lookup is temporarily unavailable. Enter your location manually.' }, { status: 502 });
  }
}
