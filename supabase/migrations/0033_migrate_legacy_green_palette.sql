alter table restaurants
  alter column primary_color set default '#6C3EF4',
  alter column secondary_color set default '#F59E0B',
  alter column background_color set default '#F7F7FB',
  alter column surface_color set default '#FFFFFF',
  alter column text_color set default '#17181D',
  alter column muted_color set default '#70758A',
  alter column border_color set default '#E7E8F0',
  alter column nav_background_color set default '#FFFFFF',
  alter column nav_text_color set default '#17181D';

update restaurants
set
  primary_color = '#6C3EF4',
  background_color = case
    when lower(coalesce(background_color, '')) in ('#f7faf7', '#e8f7ee') then '#F7F7FB'
    else background_color
  end,
  surface_color = case
    when lower(coalesce(surface_color, '')) = '#ffffff' then '#FFFFFF'
    else surface_color
  end,
  text_color = case
    when lower(coalesce(text_color, '')) in ('#142018', '#111827') then '#17181D'
    else text_color
  end,
  muted_color = case
    when lower(coalesce(muted_color, '')) in ('#68766c', '#64748b') then '#70758A'
    else muted_color
  end,
  border_color = case
    when lower(coalesce(border_color, '')) in ('#dfe8e2', '#e2e8f0') then '#E7E8F0'
    else border_color
  end,
  nav_background_color = case
    when lower(coalesce(nav_background_color, '')) in ('#1d8844', '#146333', '#f7faf7', '#e8f7ee', '#ffffff') then '#FFFFFF'
    else nav_background_color
  end,
  nav_text_color = case
    when lower(coalesce(nav_text_color, '')) in ('#142018', '#ffffff') then '#17181D'
    else nav_text_color
  end,
  updated_at = now()
where lower(primary_color) in ('#1d8844', '#146333', '#15803d', '#22c55e');
