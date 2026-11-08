-- Variants are optional surcharges. Patch only the mandatory-variant check in
-- the cash implementation and its bank-draft clone; retain all role, catalog,
-- inventory, option-group and payment-before-kitchen protections and ACLs.
do $migration$
declare
  signature text;
  definition text;
  patched text;
  required_variant_check constant text := '      or (cart."variantId" is null and exists (
        select 1
        from product_variants required_pv
        where required_pv.restaurant_id = p_restaurant_id
          and required_pv.product_id = cart."productId"
          and required_pv.is_active is true
      ))';
begin
  foreach signature in array array[
    'public.create_pos_sale_with_cash_movement_before_bank(uuid,text,text,text,order_origin,payment_method_type,text,text,jsonb)',
    'public.create_baneco_pos_draft(uuid,text,text,text,order_origin,payment_method_type,text,text,jsonb)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    patched := replace(definition, required_variant_check, '');
    if patched = definition then
      -- Allow a safe rerun, but fail if a different mandatory check appeared.
      if position('required_pv' in definition) > 0 then
        raise exception 'optional-variant-definition-changed: %', signature;
      end if;
    else
      execute patched;
    end if;
  end loop;
end $migration$;
