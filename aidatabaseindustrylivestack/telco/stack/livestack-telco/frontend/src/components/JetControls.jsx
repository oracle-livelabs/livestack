import { useEffect, useRef } from 'react';

function setJetProperty(el, name, value) {
  if (typeof el.setProperty === 'function') {
    el.setProperty(name, value);
    return;
  }
  el[name] = value;
}

function setJetProperties(el, properties) {
  if (typeof el.setProperties === 'function') {
    el.setProperties(properties);
    return;
  }
  Object.assign(el, properties);
}

function syncCustomClasses(el, className) {
  const previous = (el.dataset.customClasses || '').split(/\s+/).filter(Boolean);
  const next = className.split(/\s+/).filter(Boolean);
  previous.forEach((token) => {
    if (!next.includes(token)) el.classList.remove(token);
  });
  next.forEach((token) => el.classList.add(token));
  el.dataset.customClasses = next.join(' ');
}

export function JetButton({
  id,
  label,
  iconClass,
  chroming = 'outlined',
  disabled = false,
  display = 'all',
  title,
  role,
  ariaSelected,
  ariaControls,
  className = '',
  onAction,
}) {
  const ref = useRef(null);
  const isCallToAction = chroming === 'callToAction';

  useEffect(() => {
    const el = ref.current;
    if (!el || !onAction) return undefined;
    const handler = () => onAction();
    el.addEventListener('ojAction', handler);
    return () => el.removeEventListener('ojAction', handler);
  }, [onAction]);

  return (
    <oj-button
      id={id}
      ref={ref}
      chroming={chroming}
      disabled={disabled}
      display={display}
      title={title}
      role={role}
      aria-selected={ariaSelected}
      aria-controls={ariaControls}
      class={className}
    >
      {iconClass ? (
        <span
          slot="startIcon"
          class={iconClass}
          aria-hidden="true"
          style={isCallToAction ? { color: '#FFFFFF' } : undefined}
        />
      ) : null}
      <span>{label}</span>
    </oj-button>
  );
}

export function JetInputText({
  value,
  placeholder,
  ariaLabel,
  className = '',
  disabled = false,
  elementRef,
  onValueChange,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!elementRef) return undefined;
    elementRef.current = ref.current;
    return () => {
      elementRef.current = null;
    };
  }, [elementRef]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setJetProperty(el, 'value', value ?? '');
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onValueChange) return undefined;
    const handler = (event) => onValueChange(event.detail.value ?? '');
    el.addEventListener('rawValueChanged', handler);
    el.addEventListener('valueChanged', handler);
    return () => {
      el.removeEventListener('rawValueChanged', handler);
      el.removeEventListener('valueChanged', handler);
    };
  }, [onValueChange]);

  return (
    <oj-input-text
      ref={ref}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      label-hint={ariaLabel || placeholder}
      label-edge="none"
      disabled={disabled}
      class={className}
    />
  );
}

export function JetSelectSingle({
  value,
  options,
  placeholder,
  ariaLabel,
  className = '',
  disabled = false,
  onValueChange,
}) {
  const hostRef = useRef(null);
  const selectRef = useRef(null);
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  useEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    setJetProperty(el, 'value', value ?? '');
  }, [value]);

  useEffect(() => {
    const host = hostRef.current;
    const requireImpl = window.requirejs || window.require;
    if (!host || !requireImpl) return undefined;

    let cancelled = false;
    requireImpl(['ojs/ojselectsingle', 'ojs/ojarraydataprovider'], (SelectSingleModule, ArrayDataProviderModule) => {
      if (cancelled) return;
      const ArrayDataProvider = ArrayDataProviderModule.default || ArrayDataProviderModule;
      const selectedOption = options.find((option) => option.value === value);
      const nextValue = value ?? '';
      const nextValueItem = selectedOption
        ? {
          key: selectedOption.value,
          data: selectedOption,
        }
        : null;
      const data = new ArrayDataProvider(options, { keyAttributes: 'value' });

      let el = selectRef.current;
      const isNewElement = !el;
      if (isNewElement) {
        el = document.createElement('oj-select-single');
      }

      syncCustomClasses(el, className);
      if (placeholder) {
        el.setAttribute('placeholder', placeholder);
      } else {
        el.removeAttribute('placeholder');
      }
      el.setAttribute('label-hint', ariaLabel || placeholder || 'Select an option');
      el.setAttribute('label-edge', 'none');
      el.setAttribute('item-text', 'label');
      el.setAttribute('aria-label', ariaLabel || placeholder || 'Select an option');

      if (isNewElement) {
        el.data = data;
        el.disabled = disabled;
        el.itemText = 'label';
        el.valueItem = nextValueItem;
        el.value = nextValue;
      } else {
        setJetProperties(el, {
          data,
          disabled,
          itemText: 'label',
          valueItem: nextValueItem,
          value: nextValue,
        });
      }

      if (isNewElement) {
        el.addEventListener('valueChanged', (event) => {
          onValueChangeRef.current?.(event.detail.value ?? '');
        });
        selectRef.current = el;
        host.appendChild(el);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ariaLabel, className, disabled, options, placeholder, value]);

  useEffect(() => () => {
    selectRef.current?.remove();
    selectRef.current = null;
  }, []);

  return <span ref={hostRef} className={`jet-select-single-host ${className}`.trim()} />;
}

export function JetSwitch({
  value,
  label,
  className = '',
  disabled = false,
  style,
  onValueChange,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = Boolean(value);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onValueChange) return undefined;
    const handler = (event) => onValueChange(Boolean(event.detail.value));
    el.addEventListener('valueChanged', handler);
    return () => el.removeEventListener('valueChanged', handler);
  }, [onValueChange]);

  return (
    <oj-switch
      ref={ref}
      disabled={disabled}
      class={className}
      aria-label={label}
      title={label}
      style={style}
    />
  );
}

export function JetProgressCircle({
  value = -1,
  size = 'sm',
  className = '',
  ariaLabel = 'Loading',
}) {
  return (
    <oj-progress-circle
      value={value}
      size={size}
      class={className}
      aria-label={ariaLabel}
    />
  );
}
