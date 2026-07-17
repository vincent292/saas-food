"use client";

import { useCallback, useState } from "react";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { Input, Textarea } from "@/components/ui/Input";

export function DeliveryLocationFields({ visible }: { visible: boolean }) {
  const [address, setAddress] = useState("");
  const [detail, setDetail] = useState("");
  const handleCoordinatesChange = useCallback(() => {
    setAddress((currentAddress) => (currentAddress.trim() ? currentAddress : "Ubicacion marcada en el mapa"));
  }, []);

  return (
    <div className={visible ? "grid gap-3 md:col-span-2" : "hidden"}>
      <Input name="customerAddress" onChange={(event) => setAddress(event.target.value)} placeholder="Direccion de entrega" required={visible} value={address} />
      <Textarea name="deliveryAddressDetail" onChange={(event) => setDetail(event.target.value)} placeholder="Referencia, piso, color de puerta, zona o indicaciones" value={detail} />
      <GoogleLocationFields
        hideCoordinateInputs
        hideMapsUrlInput
        label="Ubicacion de entrega"
        latitudeName="deliveryLatitude"
        longitudeName="deliveryLongitude"
        mapHeightClassName="h-80"
        mapsUrlName="deliveryMapsUrl"
        onCoordinatesChange={handleCoordinatesChange}
        showMapByDefault
      />
    </div>
  );
}
